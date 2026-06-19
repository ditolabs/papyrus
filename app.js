/* ========================================
   Papyrus Reader - Main Application
   Fase 3: Final - Fixed
   ======================================== */

(function() {
    'use strict';

    // ========================================
    // 1. DATABASE LAYER (Dexie.js) - FIXED
    // ========================================

    const db = new Dexie('PapyrusReader');

    // Version 1 - dasar
    db.version(1).stores({
        books: '++id, title, author, format, fileName, fileSize, addedAt, lastRead, totalPages',
        progress: '++id, bookId, page, percentage, lastReadAt'
    });

    // Version 2 - tambah bookmark, highlight, settings
    db.version(2).stores({
        books: '++id, title, author, format, fileName, fileSize, addedAt, lastRead, totalPages',
        progress: '++id, bookId, page, percentage, lastReadAt',
        bookmarks: '++id, bookId, page, note, createdAt',
        highlights: '++id, bookId, page, text, note, createdAt, color',
        settings: 'key'
    }).upgrade(tx => {
        console.log('📦 Migrasi database ke version 2 selesai');
    });

    // Buka database
    db.open().catch(err => {
        console.error('❌ Gagal buka database:', err);
    });

    // ========================================
    // 2. STATE
    // ========================================

    const state = {
        books: [],
        currentTheme: 'light',
        toastTimer: null,
        readerSettings: {
            fontSize: 16,
            fontFamily: 'Georgia, serif',
            lineHeight: 1.7,
            margin: 36,
            alignment: 'justify'
        }
    };

    // ========================================
    // 3. DOM REFS
    // ========================================

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const dom = {
        app: $('#app'),
        header: $('#appHeader'),
        library: $('#library'),
        booksGrid: $('#booksGrid'),
        dropzone: $('#dropzone'),
        emptyState: $('#emptyState'),
        fileInput: $('#fileInput'),
        uploadBtn: $('#uploadBtn'),
        emptyUploadBtn: $('#emptyUploadBtn'),
        themeToggle: $('#themeToggle'),
        themeIcon: $('#themeIcon'),
        footerStats: $('#footerStats')
    };

    // ========================================
    // 4. THEME SYSTEM
    // ========================================

    const THEMES = ['light', 'dark', 'sepia'];
    const THEME_ICONS = { light: '🌙', dark: '☀️', sepia: '🌓' };

    function getNextTheme(current) {
        const idx = THEMES.indexOf(current);
        return THEMES[(idx + 1) % THEMES.length];
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        state.currentTheme = theme;
        dom.themeIcon.textContent = THEME_ICONS[theme];
        localStorage.setItem('papyrus-theme', theme);
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === theme);
        });
    }

    function loadTheme() {
        const saved = localStorage.getItem('papyrus-theme');
        if (saved && THEMES.includes(saved)) {
            applyTheme(saved);
        } else {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            applyTheme(prefersDark ? 'dark' : 'light');
        }
    }

    function toggleTheme() {
        const next = getNextTheme(state.currentTheme);
        applyTheme(next);
    }

    // ========================================
    // 5. TOAST NOTIFICATION
    // ========================================

    function showToast(message, type = 'info') {
        const existing = document.querySelector('.toast-container');
        if (existing) existing.remove();

        const container = document.createElement('div');
        container.className = 'toast-container';

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        container.appendChild(toast);
        document.body.appendChild(container);

        setTimeout(() => {
            if (container.parentNode) {
                container.remove();
            }
        }, 3000);
    }

    // ========================================
    // 6. BOOK STORAGE
    // ========================================

    async function getAllBooks() {
        try {
            const books = await db.books.toArray();
            books.sort((a, b) => (b.lastRead || 0) - (a.lastRead || 0));
            return books;
        } catch (error) {
            console.error('Gagal mengambil buku:', error);
            return [];
        }
    }

    async function getBook(id) {
        try {
            return await db.books.get(id);
        } catch (error) {
            console.error('Gagal mengambil buku:', error);
            return null;
        }
    }

    async function saveBook(book) {
        try {
            book.lastRead = Date.now();
            const id = await db.books.add(book);
            return id;
        } catch (error) {
            console.error('Gagal menyimpan buku:', error);
            throw error;
        }
    }

    async function updateBook(id, updates) {
        try {
            updates.lastRead = Date.now();
            await db.books.update(id, updates);
        } catch (error) {
            console.error('Gagal update buku:', error);
            throw error;
        }
    }

    async function deleteBook(id) {
        try {
            await db.books.delete(id);
            await db.progress.where('bookId').equals(id).delete();
            await db.bookmarks.where('bookId').equals(id).delete();
            await db.highlights.where('bookId').equals(id).delete();
        } catch (error) {
            console.error('Gagal hapus buku:', error);
            throw error;
        }
    }

    async function saveProgress(bookId, page, totalPages) {
        try {
            const percentage = totalPages > 0 ? Math.round((page / totalPages) * 100) : 0;
            const existing = await db.progress.where('bookId').equals(bookId).first();

            if (existing) {
                await db.progress.update(existing.id, {
                    page,
                    percentage,
                    lastReadAt: Date.now()
                });
            } else {
                await db.progress.add({
                    bookId,
                    page,
                    percentage,
                    lastReadAt: Date.now()
                });
            }

            await db.books.update(bookId, { lastRead: Date.now() });
            return { page, percentage };

        } catch (error) {
            console.error('Gagal simpan progress:', error);
            return null;
        }
    }

    async function getProgress(bookId) {
        try {
            return await db.progress.where('bookId').equals(bookId).first();
        } catch (error) {
            console.error('Gagal ambil progress:', error);
            return null;
        }
    }

    // ========================================
    // 7. BOOKMARK STORAGE
    // ========================================

    async function getBookmarks(bookId) {
        try {
            return await db.bookmarks.where('bookId').equals(bookId).toArray();
        } catch (e) {
            return [];
        }
    }

    async function addBookmark(bookId, page, note = '') {
        try {
            const id = await db.bookmarks.add({
                bookId,
                page,
                note: note || `Halaman ${page}`,
                createdAt: Date.now()
            });
            return id;
        } catch (e) {
            console.error('Gagal add bookmark:', e);
            return null;
        }
    }

    async function removeBookmark(id) {
        try {
            await db.bookmarks.delete(id);
            return true;
        } catch (e) {
            console.error('Gagal remove bookmark:', e);
            return false;
        }
    }

    // ========================================
    // 8. HIGHLIGHT STORAGE
    // ========================================

    async function getHighlights(bookId) {
        try {
            return await db.highlights.where('bookId').equals(bookId).toArray();
        } catch (e) {
            return [];
        }
    }

    async function addHighlight(bookId, page, text, note = '', color = '#f9e66b') {
        try {
            const id = await db.highlights.add({
                bookId,
                page,
                text: text.substring(0, 500),
                note,
                color,
                createdAt: Date.now()
            });
            return id;
        } catch (e) {
            console.error('Gagal add highlight:', e);
            return null;
        }
    }

    async function removeHighlight(id) {
        try {
            await db.highlights.delete(id);
            return true;
        } catch (e) {
            console.error('Gagal remove highlight:', e);
            return false;
        }
    }

    async function updateHighlight(id, updates) {
        try {
            await db.highlights.update(id, updates);
            return true;
        } catch (e) {
            console.error('Gagal update highlight:', e);
            return false;
        }
    }

    // ========================================
    // 9. SETTINGS STORAGE
    // ========================================

    function getReaderSettings() {
        try {
            const saved = localStorage.getItem('papyrus-reader-settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                state.readerSettings = { ...state.readerSettings, ...parsed };
            }
        } catch (e) {}
        return state.readerSettings;
    }

    function saveReaderSettings(settings) {
        state.readerSettings = { ...state.readerSettings, ...settings };
        localStorage.setItem('papyrus-reader-settings', JSON.stringify(state.readerSettings));
        if (readerInstance) {
            readerInstance.applySettings(state.readerSettings);
        }
    }

    // ========================================
    // 10. FILE UPLOAD & PARSING
    // ========================================

    const SUPPORTED_FORMATS = {
        'epub': 'EPUB',
        'pdf': 'PDF',
        'txt': 'TXT',
        'md': 'Markdown',
        'markdown': 'Markdown'
    };

    function getFileExtension(filename) {
        return filename.split('.').pop().toLowerCase();
    }

    function getFormatLabel(filename) {
        const ext = getFileExtension(filename);
        return SUPPORTED_FORMATS[ext] || null;
    }

    function isSupported(filename) {
        const ext = getFileExtension(filename);
        return ext in SUPPORTED_FORMATS;
    }

    function getFileSize(size) {
        if (size < 1024) return size + ' B';
        if (size < 1048576) return (size / 1024).toFixed(1) + ' KB';
        return (size / 1048576).toFixed(1) + ' MB';
    }

    async function parseBookMetadata(file) {
        const format = getFormatLabel(file.name);
        let title = file.name.replace(/\.[^.]+$/, '');
        return {
            title: title || 'Tanpa Judul',
            author: 'Tanpa Penulis',
            format: format || 'Unknown',
            fileName: file.name,
            fileSize: file.size,
            fileSizeFormatted: getFileSize(file.size),
            addedAt: Date.now(),
            totalPages: 0
        };
    }

    async function handleFileUpload(file) {
        if (!isSupported(file.name)) {
            const ext = getFileExtension(file.name);
            showToast(`Format .${ext} tidak didukung. Support: EPUB, PDF, TXT, MD`, 'error');
            return false;
        }

        try {
            const existing = await db.books
                .where('fileName')
                .equals(file.name)
                .and(b => b.fileSize === file.size)
                .first();

            if (existing) {
                showToast(`Buku "${existing.title}" sudah ada di perpustakaan`, 'info');
                return false;
            }

            const meta = await parseBookMetadata(file);
            const bookData = {
                ...meta,
                file: file,
                lastRead: null
            };

            await saveBook(bookData);
            showToast(`✅ "${meta.title}" berhasil ditambahkan`, 'success');
            await renderLibrary();
            await updateFooterStats();
            return true;

        } catch (error) {
            console.error('Gagal upload file:', error);
            showToast('Gagal menambahkan buku', 'error');
            return false;
        }
    }

    // ========================================
    // 11. RENDER LIBRARY
    // ========================================

    async function renderLibrary() {
        try {
            const books = await getAllBooks();
            state.books = books;

            if (books.length === 0) {
                dom.booksGrid.innerHTML = '';
                dom.dropzone.style.display = 'block';
                dom.emptyState.classList.add('visible');
                dom.booksGrid.style.display = 'none';
                return;
            }

            dom.booksGrid.style.display = 'grid';
            dom.dropzone.style.display = 'block';
            dom.emptyState.classList.remove('visible');

            let html = '';
            for (const book of books) {
                const progress = await getProgress(book.id);
                const percentage = progress?.percentage || 0;
                const page = progress?.page || 0;
                const totalPages = book.totalPages || 0;

                const formatIcons = { 'EPUB': '📘', 'PDF': '📕', 'TXT': '📄', 'Markdown': '📝' };
                const icon = formatIcons[book.format] || '📖';

                let lastReadText = 'Belum dibaca';
                if (book.lastRead) {
                    const date = new Date(book.lastRead);
                    const now = new Date();
                    const diff = (now - date) / (1000 * 60 * 60 * 24);
                    if (diff < 1) lastReadText = 'Hari ini';
                    else if (diff < 2) lastReadText = 'Kemarin';
                    else if (diff < 7) lastReadText = `${Math.round(diff)} hari lalu`;
                    else lastReadText = date.toLocaleDateString('id-ID');
                }

                const bookmarkCount = await db.bookmarks.where('bookId').equals(book.id).count();
                const highlightCount = await db.highlights.where('bookId').equals(book.id).count();

                html += `
                    <div class="book-card" data-id="${book.id}">
                        <div class="book-cover">
                            <span>${icon}</span>
                            <span class="format-badge">${book.format}</span>
                            ${bookmarkCount > 0 ? '<span class="format-badge" style="right:60px;">🔖'+bookmarkCount+'</span>' : ''}
                        </div>
                        <div class="book-info">
                            <div class="book-title" title="${book.title}">${book.title}</div>
                            <div class="book-author">${book.author}</div>
                            <div class="book-meta">
                                <span>${book.fileSizeFormatted}</span>
                                <span>${lastReadText}</span>
                            </div>
                            <div class="book-progress-container">
                                <div class="book-progress-bar">
                                    <div class="book-progress-fill" style="width: ${percentage}%"></div>
                                </div>
                                <span class="book-progress-text">${percentage}%</span>
                            </div>
                            <div class="book-actions">
                                <button class="btn-sm" data-action="read">📖 Baca</button>
                                <button class="btn-sm danger" data-action="delete">🗑️ Hapus</button>
                            </div>
                        </div>
                    </div>
                `;
            }

            dom.booksGrid.innerHTML = html;

            dom.booksGrid.querySelectorAll('.book-card').forEach(card => {
                const id = parseInt(card.dataset.id);

                card.addEventListener('click', (e) => {
                    if (e.target.closest('.book-actions')) return;
                    openReader(id);
                });

                card.querySelector('[data-action="read"]').addEventListener('click', (e) => {
                    e.stopPropagation();
                    openReader(id);
                });

                card.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (confirm(`Hapus buku "${card.querySelector('.book-title').textContent}"?`)) {
                        try {
                            await deleteBook(id);
                            showToast('Buku dihapus', 'info');
                            await renderLibrary();
                            await updateFooterStats();
                        } catch (error) {
                            showToast('Gagal hapus buku', 'error');
                        }
                    }
                });
            });

        } catch (error) {
            console.error('Gagal render library:', error);
            showToast('Gagal memuat perpustakaan', 'error');
        }
    }

    // ========================================
    // 12. READER - FIXED (dengan logging & error handling)
    // ========================================

    let readerInstance = null;

    async function openReader(bookId) {
        console.log('📖 Membuka buku ID:', bookId);
        
        try {
            const book = await getBook(bookId);
            if (!book) {
                showToast('Buku tidak ditemukan', 'error');
                console.error('❌ Buku tidak ditemukan:', bookId);
                return;
            }
            console.log('📚 Data buku:', book.title, book.format);

            if (readerInstance) {
                readerInstance.close();
                readerInstance = null;
            }

            // Validasi elemen
            const container = document.getElementById('reader-container');
            if (!container) {
                console.error('❌ reader-container tidak ditemukan');
                showToast('Error: reader-container tidak ditemukan', 'error');
                return;
            }

            console.log('✅ Membuat instance Reader...');
            readerInstance = new Reader({
                container: container,
                toolbar: document.getElementById('readerToolbar'),
                pageIndicator: document.getElementById('pageIndicator'),
                progressFill: document.getElementById('progressFill'),
                tocList: document.getElementById('tocList'),
                tocPanel: document.getElementById('tocPanel'),
                bookmarkPanel: document.getElementById('bookmarkPanel'),
                bookmarkList: document.getElementById('bookmarkList'),
                highlightPanel: document.getElementById('highlightPanel'),
                highlightList: document.getElementById('highlightList'),
                searchPanel: document.getElementById('searchPanel'),
                searchInput: document.getElementById('searchInput'),
                searchResults: document.getElementById('searchResults'),
                settingsPanel: document.getElementById('settingsPanel'),
                panelOverlay: document.getElementById('panelOverlay'),
                onClose: () => {
                    console.log('📖 Reader ditutup');
                    readerInstance = null;
                    renderLibrary();
                    updateFooterStats();
                },
                onProgress: async () => {
                    renderLibrary();
                },
                db: db,
                getBookmarks: getBookmarks,
                addBookmark: addBookmark,
                removeBookmark: removeBookmark,
                getHighlights: getHighlights,
                addHighlight: addHighlight,
                removeHighlight: removeHighlight,
                updateHighlight: updateHighlight,
                getReaderSettings: getReaderSettings,
                saveReaderSettings: saveReaderSettings,
                showToast: showToast
            });

            console.log('✅ Reader instance dibuat, membuka buku...');
            await readerInstance.open(book);
            console.log('✅ Buku berhasil dibuka');

        } catch (error) {
            console.error('❌ Gagal membuka buku:', error);
            showToast('Gagal membuka buku: ' + error.message, 'error');
            if (readerInstance) {
                readerInstance.close();
                readerInstance = null;
            }
        }
    }

    // ========================================
    // 13. FOOTER STATS
    // ========================================

    async function updateFooterStats() {
        const books = await getAllBooks();
        const totalBooks = books.length;
        const totalPages = books.reduce((sum, b) => sum + (b.totalPages || 0), 0);
        dom.footerStats.textContent = `${totalBooks} buku · ${totalPages} halaman`;
    }

    // ========================================
    // 14. EVENT BINDING
    // ========================================

    dom.themeToggle.addEventListener('click', toggleTheme);

    dom.uploadBtn.addEventListener('click', () => dom.fileInput.click());
    dom.emptyUploadBtn.addEventListener('click', () => dom.fileInput.click());

    dom.fileInput.addEventListener('change', async (e) => {
        const files = e.target.files;
        if (files.length === 0) return;

        for (const file of files) {
            await handleFileUpload(file);
        }
        dom.fileInput.value = '';
    });

    dom.dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dom.dropzone.classList.add('drag-over');
    });

    dom.dropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dom.dropzone.classList.remove('drag-over');
    });

    dom.dropzone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dom.dropzone.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (files.length === 0) return;

        for (const file of files) {
            await handleFileUpload(file);
        }
    });

    dom.dropzone.addEventListener('click', (e) => {
        if (e.target === dom.dropzone || e.target.closest('.dropzone-content')) {
            dom.fileInput.click();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'o') {
            e.preventDefault();
            dom.fileInput.click();
        }
        if (e.ctrlKey && e.shiftKey && e.key === 'D') {
            e.preventDefault();
            toggleTheme();
        }
    });

    // ========================================
    // 15. INITIALIZATION
    // ========================================

    async function init() {
        try {
            loadTheme();
            getReaderSettings();
            await renderLibrary();
            await updateFooterStats();
            console.log('📖 Papyrus Reader - Fase 3 Final siap!');
            console.log(`📚 ${state.books.length} buku di perpustakaan`);
        } catch (error) {
            console.error('Gagal inisialisasi:', error);
            showToast('Gagal memuat aplikasi', 'error');
        }
    }

    init();

    window.__Papyrus = {
        db,
        state,
        getAllBooks,
        getBook,
        saveBook,
        updateBook,
        deleteBook,
        saveProgress,
        getProgress,
        getBookmarks,
        addBookmark,
        removeBookmark,
        getHighlights,
        addHighlight,
        removeHighlight,
        updateHighlight,
        getReaderSettings,
        saveReaderSettings,
        renderLibrary,
        handleFileUpload,
        showToast,
        openReader,
        updateFooterStats,
        toggleTheme,
        applyTheme
    };

})();