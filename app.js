/* ========================================
   Papyrus Reader - Main Application
   Fase 1: Foundation
   ======================================== */

(function() {
    'use strict';

    // ========================================
    // 1. DATABASE LAYER (Dexie.js)
    // ========================================

    const db = new Dexie('PapyrusReader');

    db.version(1).stores({
        books: '++id, title, author, format, fileName, fileSize, addedAt, lastRead',
        progress: '++id, bookId, page, percentage, lastReadAt',
        settings: 'key'
    });

    // ========================================
    // 2. STATE
    // ========================================

    const state = {
        books: [],
        currentTheme: 'light',
        toastTimer: null
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
    const THEME_ICONS = {
        light: '🌙',
        dark: '☀️',
        sepia: '🌓'
    };

    function getNextTheme(current) {
        const idx = THEMES.indexOf(current);
        return THEMES[(idx + 1) % THEMES.length];
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        state.currentTheme = theme;
        dom.themeIcon.textContent = THEME_ICONS[theme];
        localStorage.setItem('papyrus-theme', theme);
    }

    function loadTheme() {
        const saved = localStorage.getItem('papyrus-theme');
        if (saved && THEMES.includes(saved)) {
            applyTheme(saved);
        } else {
            // Deteksi preferensi sistem
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
        // Hapus toast sebelumnya
        const existing = document.querySelector('.toast-container');
        if (existing) existing.remove();

        const container = document.createElement('div');
        container.className = 'toast-container';

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        container.appendChild(toast);
        document.body.appendChild(container);

        // Auto remove setelah animasi
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
            // Sort by lastRead (newest first)
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
            // Hapus progress terkait
            await db.progress.where('bookId').equals(id).delete();
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

            // Update lastRead di buku
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
    // 7. FILE UPLOAD & PARSING
    // ========================================

    // Format yang didukung
    const SUPPORTED_FORMATS = {
        'epub': 'EPUB',
        'pdf': 'PDF',
        'txt': 'TXT',
        'md': 'Markdown',
        'markdown': 'Markdown'
    };

    function getFileExtension(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        return ext;
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

    // Parser sederhana untuk metadata
    async function parseBookMetadata(file) {
        const format = getFormatLabel(file.name);
        const ext = getFileExtension(file.name);

        let title = file.name.replace(/\.[^.]+$/, '');
        let author = '';

        // Coba ekstrak dari PDF
        if (ext === 'pdf') {
            try {
                // Gunakan PDF.js untuk metadata
                // Note: PDF.js akan di-load saat dibutuhkan
                const arrayBuffer = await file.arrayBuffer();
                // Simpan sementara, nanti di parse saat reader
            } catch (e) {
                // Abaikan
            }
        }

        // Untuk EPUB, kita akan parse saat reader dibuka

        return {
            title: title || 'Tanpa Judul',
            author: author || 'Tanpa Penulis',
            format: format || ext.toUpperCase(),
            fileName: file.name,
            fileSize: file.size,
            fileSizeFormatted: getFileSize(file.size),
            addedAt: Date.now()
        };
    }

    async function handleFileUpload(file) {
        // Validasi
        if (!isSupported(file.name)) {
            const ext = getFileExtension(file.name);
            showToast(`Format .${ext} tidak didukung. Support: EPUB, PDF, TXT, MD`, 'error');
            return false;
        }

        try {
            // Cek duplikat (berdasarkan nama dan ukuran)
            const existing = await db.books
                .where('fileName')
                .equals(file.name)
                .and(b => b.fileSize === file.size)
                .first();

            if (existing) {
                showToast(`Buku "${existing.title}" sudah ada di perpustakaan`, 'info');
                return false;
            }

            // Parse metadata dasar
            const meta = await parseBookMetadata(file);

            // Simpan file sebagai Blob
            const bookData = {
                ...meta,
                file: file, // Blob
                lastRead: null
            };

            const id = await saveBook(bookData);
            showToast(`✅ "${meta.title}" berhasil ditambahkan`, 'success');

            // Refresh library
            await renderLibrary();
            return true;

        } catch (error) {
            console.error('Gagal upload file:', error);
            showToast('Gagal menambahkan buku', 'error');
            return false;
        }
    }

    // ========================================
    // 8. RENDER LIBRARY
    // ========================================

    async function renderLibrary() {
        try {
            const books = await getAllBooks();
            state.books = books;

            // Update footer
            const totalBooks = books.length;
            const totalPages = books.reduce((sum, b) => sum + (b.totalPages || 0), 0);
            dom.footerStats.textContent = `${totalBooks} buku${totalBooks > 1 ? '' : ''} · ${totalPages} halaman`;

            // Tampilkan empty state jika tidak ada buku
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

            // Render cards
            let html = '';
            for (const book of books) {
                const progress = await getProgress(book.id);
                const percentage = progress?.percentage || 0;
                const page = progress?.page || 0;
                const totalPages = book.totalPages || 0;

                // Format icon berdasarkan format
                const formatIcons = {
                    'EPUB': '📘',
                    'PDF': '📕',
                    'TXT': '📄',
                    'Markdown': '📝'
                };
                const icon = formatIcons[book.format] || '📖';

                // Last read date
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

                html += `
                    <div class="book-card" data-id="${book.id}">
                        <div class="book-cover">
                            <span>${icon}</span>
                            <span class="format-badge">${book.format}</span>
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

            // Event listeners untuk card
            dom.booksGrid.querySelectorAll('.book-card').forEach(card => {
                const id = parseInt(card.dataset.id);

                // Klik pada card (kecuali tombol) = Baca
                card.addEventListener('click', (e) => {
                    // Jika klik pada tombol, jangan trigger
                    if (e.target.closest('.book-actions')) return;
                    openReader(id);
                });

                // Tombol Baca
                card.querySelector('[data-action="read"]').addEventListener('click', (e) => {
                    e.stopPropagation();
                    openReader(id);
                });

                // Tombol Hapus
                card.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (confirm(`Hapus buku "${card.querySelector('.book-title').textContent}"?`)) {
                        try {
                            await deleteBook(id);
                            showToast('Buku dihapus', 'info');
                            await renderLibrary();
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
    // 9. READER (Placeholder untuk Fase 2)
    // ========================================

    async function openReader(bookId) {
        const book = await getBook(bookId);
        if (!book) {
            showToast('Buku tidak ditemukan', 'error');
            return;
        }

        // Untuk Fase 1, kita hanya preview
        const progress = await getProgress(bookId);
        const page = progress?.page || 1;
        const totalPages = book.totalPages || '?';

        showToast(`📖 Membuka "${book.title}" - Halaman ${page}/${totalPages}`, 'info');

        // TODO: Fase 2 - Implementasi reader sebenarnya
        console.log(`Membuka buku: ${book.title} (${book.format})`);
        console.log(`Progress: halaman ${page} dari ${totalPages}`);
        console.log('File:', book.file);
    }

    // ========================================
    // 10. EVENT BINDING
    // ========================================

    // --- Theme ---
    dom.themeToggle.addEventListener('click', toggleTheme);

    // --- Upload ---
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

    // --- Drag & Drop ---
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

    // Klik dropzone juga trigger upload (kecuali jika ada file di dalam)
    dom.dropzone.addEventListener('click', (e) => {
        // Jangan trigger jika klik pada anak-anak (untuk menghindari double)
        if (e.target === dom.dropzone || e.target.closest('.dropzone-content')) {
            dom.fileInput.click();
        }
    });

    // --- Keyboard Shortcuts ---
    document.addEventListener('keydown', (e) => {
        // Ctrl+O = Upload
        if (e.ctrlKey && e.key === 'o') {
            e.preventDefault();
            dom.fileInput.click();
        }

        // Ctrl+Shift+D = Toggle dark mode
        if (e.ctrlKey && e.shiftKey && e.key === 'D') {
            e.preventDefault();
            toggleTheme();
        }
    });

    // ========================================
    // 11. INITIALIZATION
    // ========================================

    async function init() {
        try {
            // Load theme
            loadTheme();

            // Render library
            await renderLibrary();

            console.log('📖 Papyrus Reader - Fase 1 Foundation siap!');
            console.log(`📚 ${state.books.length} buku di perpustakaan`);

        } catch (error) {
            console.error('Gagal inisialisasi:', error);
            showToast('Gagal memuat aplikasi', 'error');
        }
    }

    // Jalankan
    init();

    // Expose untuk debugging (opsional)
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
        renderLibrary,
        handleFileUpload,
        showToast
    };

})();