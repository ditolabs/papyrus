/* ========================================
   Papyrus Reader - Single File App
   Semua kode digabung untuk kompatibilitas Android
   ======================================== */

(function() {
    'use strict';

    // ============================================================
    // 1. DATABASE LAYER (Dexie)
    // ============================================================

    const db = new Dexie('PapyrusReader');

    db.version(1).stores({
        books: '++id, title, author, format, fileName, fileSize, addedAt, lastRead, totalPages',
        progress: '++id, bookId, page, percentage, lastReadAt'
    });

    db.version(2).stores({
        books: '++id, title, author, format, fileName, fileSize, addedAt, lastRead, totalPages',
        progress: '++id, bookId, page, percentage, lastReadAt',
        bookmarks: '++id, bookId, page, note, createdAt',
        highlights: '++id, bookId, page, text, note, createdAt, color',
        settings: 'key'
    }).upgrade(tx => {
        console.log('📦 Migrasi database ke version 2 selesai');
    });

    db.open().catch(err => console.error('❌ Gagal buka database:', err));

    // ============================================================
    // 2. STATE
    // ============================================================

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

    // ============================================================
    // 3. DOM REFS
    // ============================================================

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

    // ============================================================
    // 4. THEME SYSTEM
    // ============================================================

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

    // ============================================================
    // 5. TOAST
    // ============================================================

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

    // ============================================================
    // 6. STORAGE FUNCTIONS
    // ============================================================

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

    // ============================================================
    // 7. FILE UPLOAD
    // ============================================================

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

    // ============================================================
    // 8. RENDER LIBRARY
    // ============================================================

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

    // ============================================================
    // 9. ENGINES
    // ============================================================

    // Base Engine
    class BaseEngine {
        constructor(file) {
            this.file = file;
            this.metadata = { title: '', author: '', cover: null };
            this.toc = [];
            this.totalPages = 0;
            this.loaded = false;
        }
        async load() { throw new Error('Method load() harus diimplementasikan'); }
        async getPage(pageNum) { throw new Error('Method getPage() harus diimplementasikan'); }
        getTotalPages() { return this.totalPages; }
        getMetadata() { return this.metadata; }
        getTOC() { return this.toc; }
        isLoaded() { return this.loaded; }
    }

    // EPUB Engine
    class EPUBEngine extends BaseEngine {
        constructor(file) {
            super(file);
            this.book = null;
            this.rawContent = '';
            this.spineItems = [];
        }
        async load() {
            try {
                this.book = ePub(this.file);
                await this.book.ready;
                const meta = this.book.package.metadata;
                this.metadata = {
                    title: meta.title || 'Tanpa Judul',
                    author: meta.creator || 'Tanpa Penulis',
                    cover: await this.book.coverUrl()
                };
                this.toc = this.book.navigation || [];
                this.spineItems = this.book.spine.spineItems;
                let fullHTML = '';
                for (const item of this.spineItems) {
                    try {
                        const doc = await this.book.load(item.href);
                        if (doc && doc.body) {
                            fullHTML += doc.body.innerHTML;
                            fullHTML += '<div class="section-break"></div>';
                        }
                    } catch (e) {}
                }
                this.rawContent = fullHTML;
                this.totalPages = 0;
                this.loaded = true;
                return this;
            } catch (error) {
                throw new Error('Gagal memuat file EPUB: ' + error.message);
            }
        }
        getContentHTML() { return this.rawContent; }
        getSpineItems() { return this.spineItems; }
        async getPage(pageNum) { return this.rawContent; }
    }

    // PDF Engine
    class PDFEngine extends BaseEngine {
        constructor(file) {
            super(file);
            this.pdfDoc = null;
            this.scale = 1.5;
        }
        async load() {
            try {
                pdfjsLib.GlobalWorkerOptions.workerSrc = 
                    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                const arrayBuffer = await this.file.arrayBuffer();
                const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
                this.pdfDoc = await loadingTask.promise;
                const meta = await this.pdfDoc.getMetadata();
                const info = meta.info || {};
                this.metadata = {
                    title: info.Title || this.file.name.replace(/\.[^.]+$/, '') || 'Dokumen PDF',
                    author: info.Author || 'Tanpa Penulis',
                    cover: null
                };
                this.totalPages = this.pdfDoc.numPages;
                this.toc = [];
                this.loaded = true;
                return this;
            } catch (error) {
                throw new Error('Gagal memuat file PDF: ' + error.message);
            }
        }
        async getPage(pageNum) {
            if (!this.pdfDoc) throw new Error('PDF belum dimuat');
            if (pageNum < 1 || pageNum > this.totalPages) throw new Error('Halaman tidak valid');
            try {
                const page = await this.pdfDoc.getPage(pageNum);
                const viewport = page.getViewport({ scale: this.scale });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext('2d');
                await page.render({ canvasContext: ctx, viewport }).promise;
                return canvas.toDataURL('image/jpeg', 0.92);
            } catch (error) {
                console.error('Gagal render halaman PDF:', pageNum, error);
                return null;
            }
        }
        setScale(scale) { this.scale = Math.max(0.5, Math.min(3, scale)); }
        getScale() { return this.scale; }
    }

    // TXT Engine
    class TXTEngine extends BaseEngine {
        constructor(file) {
            super(file);
            this.paragraphs = [];
        }
        async load() {
            try {
                const text = await this.file.text();
                this.paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
                this.metadata = {
                    title: this.file.name.replace(/\.[^.]+$/, '') || 'Dokumen Teks',
                    author: 'Tanpa Penulis',
                    cover: null
                };
                this.totalPages = 0;
                this.toc = [];
                this.loaded = true;
                return this;
            } catch (error) {
                throw new Error('Gagal memuat file teks: ' + error.message);
            }
        }
        getContentHTML() {
            return this.paragraphs.map(p => `<p>${this.escapeHTML(p)}</p>`).join('');
        }
        escapeHTML(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        async getPage(pageNum) { return this.getContentHTML(); }
    }

    // Markdown Engine
    class MarkdownEngine extends BaseEngine {
        constructor(file) {
            super(file);
            this.htmlContent = '';
        }
        async load() {
            try {
                const text = await this.file.text();
                this.htmlContent = this.parseMarkdown(text);
                this.metadata = {
                    title: this.file.name.replace(/\.[^.]+$/, '') || 'Dokumen Markdown',
                    author: 'Tanpa Penulis',
                    cover: null
                };
                this.totalPages = 0;
                this.toc = [];
                this.loaded = true;
                return this;
            } catch (error) {
                throw new Error('Gagal memuat file Markdown: ' + error.message);
            }
        }
        parseMarkdown(text) {
            let html = text;
            html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
            html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
            html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
            html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
            html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
            html = html.replace(/_(.*?)_/g, '<em>$1</em>');
            html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
            html = html.replace(/^\s*-\s+(.*$)/gim, '<li>$1</li>');
            html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
            html = html.replace(/^\s*\d+\.\s+(.*$)/gim, '<li>$1</li>');
            html = html.replace(/^(?!<[h|ul|li])(.*$)/gim, '<p>$1</p>');
            html = html.replace(/<p>\s*<\/p>/g, '');
            return html;
        }
        getContentHTML() { return this.htmlContent; }
        async getPage(pageNum) { return this.htmlContent; }
    }

    // ============================================================
    // 10. PAGINATOR
    // ============================================================

    class Paginator {
        constructor(content, width, height, options = {}) {
            this.content = content;
            this.width = width;
            this.height = height;
            this.fontFamily = options.fontFamily || 'Georgia, serif';
            this.fontSize = options.fontSize || '16px';
            this.lineHeight = options.lineHeight || 1.7;
            this.padding = options.padding || 40;
            this.maxPages = options.maxPages || 2000;
            this.pages = [];
            this._dummy = null;
        }

        async paginate() {
            if (!this.content || this.content.trim().length === 0) {
                this.pages = ['<p><em>Kosong</em></p>'];
                return this.pages;
            }
            this.pages = [];
            this._createDummy();
            let remaining = this.content;
            let pageCount = 0;
            while (remaining.trim().length > 0 && pageCount < this.maxPages) {
                const pageHTML = this._extractPage(remaining);
                if (!pageHTML) break;
                this.pages.push(pageHTML);
                pageCount++;
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = remaining;
                const allChildren = Array.from(tempDiv.children);
                const usedChildren = this._getUsedChildren(pageHTML, allChildren);
                const remainingChildren = allChildren.slice(usedChildren.length);
                remaining = remainingChildren.map(el => el.outerHTML).join('');
            }
            this._destroyDummy();
            if (this.pages.length === 0) {
                this.pages = ['<p><em>Konten tidak dapat dipaginasi</em></p>'];
            }
            return this.pages;
        }

        _createDummy() {
            this._dummy = document.createElement('div');
            const w = this.width - this.padding * 2;
            const h = this.height - this.padding * 2;
            this._dummy.style.cssText = `
                position: absolute; left: -9999px; top: 0;
                width: ${w}px; height: ${h}px; overflow: hidden;
                font-family: ${this.fontFamily}; font-size: ${this.fontSize};
                line-height: ${this.lineHeight}; padding: 0;
                box-sizing: border-box; word-wrap: break-word; white-space: normal;
            `;
            document.body.appendChild(this._dummy);
        }

        _destroyDummy() {
            if (this._dummy && this._dummy.parentNode) {
                this._dummy.parentNode.removeChild(this._dummy);
            }
            this._dummy = null;
        }

        _extractPage(html) {
            this._dummy.innerHTML = html;
            if (this._dummy.scrollHeight <= this._dummy.clientHeight) {
                return html;
            }
            const children = Array.from(this._dummy.children);
            if (children.length === 0) {
                return this._extractTextPage(html);
            }
            let low = 0, high = children.length - 1, result = 0;
            while (low <= high) {
                const mid = Math.floor((low + high) / 2);
                while (this._dummy.children.length > mid + 1) {
                    this._dummy.removeChild(this._dummy.lastChild);
                }
                if (this._dummy.scrollHeight <= this._dummy.clientHeight) {
                    result = mid + 1;
                    low = mid + 1;
                } else {
                    high = mid - 1;
                }
                this._dummy.innerHTML = html;
            }
            const pageChildren = children.slice(0, result);
            if (pageChildren.length === 0) {
                return this._extractTextPage(html);
            }
            return pageChildren.map(el => el.outerHTML).join('');
        }

        _extractTextPage(html) {
            const maxChars = Math.floor(this._dummy.clientWidth * this._dummy.clientHeight / 12);
            const text = html.replace(/<[^>]+>/g, ' ').trim();
            if (text.length <= maxChars) return html;
            const cut = text.substring(0, maxChars);
            const lastSpace = cut.lastIndexOf(' ');
            const pageText = text.substring(0, lastSpace > 0 ? lastSpace : maxChars);
            return `<p>${pageText}...</p>`;
        }

        _getUsedChildren(pageHTML, allChildren) {
            const used = [];
            for (const child of allChildren) {
                if (pageHTML.includes(child.outerHTML)) {
                    used.push(child);
                }
            }
            return used;
        }

        getPageCount() { return this.pages.length; }
        getPage(index) {
            if (index >= 0 && index < this.pages.length) return this.pages[index];
            return null;
        }
    }

    // ============================================================
    // 11. FLIPBOOK
    // ============================================================

    class Flipbook {
        constructor(options) {
            this.container = options.container;
            this.pageLeft = options.pageLeft;
            this.pageRight = options.pageRight;
            this.onPageChange = options.onPageChange || (() => {});
            this.duration = options.animationDuration || 500;
            this.totalPages = 0;
            this.currentSpread = 0;
            this.isAnimating = false;
            this.pages = [];
            this.isSinglePage = window.innerWidth < 768;
        }

        setPages(pages, startPage = 0) {
            this.pages = pages;
            this.totalPages = pages.length;
            this.currentSpread = Math.min(startPage, this.totalPages - 1);
            if (this.currentSpread % 2 !== 0) this.currentSpread -= 1;
            if (this.currentSpread < 0) this.currentSpread = 0;
            this.render();
        }

        render() {
            const leftIdx = this.currentSpread;
            const rightIdx = this.currentSpread + 1;
            this.pageLeft.innerHTML = this.getPageHTML(leftIdx);
            this.pageRight.innerHTML = this.getPageHTML(rightIdx);
            this.pageLeft.classList.remove('flip-forward');
            this.pageRight.classList.remove('flip-backward');
            this.onPageChange(leftIdx, rightIdx);
        }

        getPageHTML(index) {
            if (index >= 0 && index < this.totalPages) return this.pages[index];
            return '<div class="empty-page"></div>';
        }

        async next() {
            if (this.isAnimating) return;
            if (this.currentSpread + 2 >= this.totalPages) return;
            this.isAnimating = true;
            this.pageRight.classList.add('flip-forward');
            await this._wait(this.duration);
            this.currentSpread += 2;
            const leftIdx = this.currentSpread;
            const rightIdx = this.currentSpread + 1;
            this.pageLeft.innerHTML = this.getPageHTML(leftIdx);
            this.pageRight.innerHTML = this.getPageHTML(rightIdx);
            this.pageRight.classList.remove('flip-forward');
            this.isAnimating = false;
            this.onPageChange(leftIdx, rightIdx);
        }

        async prev() {
            if (this.isAnimating) return;
            if (this.currentSpread - 2 < 0) return;
            this.isAnimating = true;
            this.pageLeft.classList.add('flip-backward');
            await this._wait(this.duration);
            this.currentSpread -= 2;
            const leftIdx = this.currentSpread;
            const rightIdx = this.currentSpread + 1;
            this.pageLeft.innerHTML = this.getPageHTML(leftIdx);
            this.pageRight.innerHTML = this.getPageHTML(rightIdx);
            this.pageLeft.classList.remove('flip-backward');
            this.isAnimating = false;
            this.onPageChange(leftIdx, rightIdx);
        }

        async goTo(pageIndex) {
            if (this.isAnimating) return;
            if (pageIndex < 0 || pageIndex >= this.totalPages) return;
            let spread = pageIndex;
            if (spread % 2 !== 0) spread -= 1;
            if (spread < 0) spread = 0;
            if (spread === this.currentSpread) return;
            if (Math.abs(spread - this.currentSpread) > 2) {
                this.currentSpread = spread;
                this.render();
                return;
            }
            while (this.currentSpread < spread) await this.next();
            while (this.currentSpread > spread) await this.prev();
        }

        getCurrentInfo() {
            const left = this.currentSpread + 1;
            const right = Math.min(this.currentSpread + 2, this.totalPages);
            return { leftPage: left, rightPage: right, totalPages: this.totalPages, leftIndex: this.currentSpread, rightIndex: this.currentSpread + 1 };
        }

        updateLayout() {
            const isMobile = window.innerWidth < 768;
            if (isMobile !== this.isSinglePage) {
                this.isSinglePage = isMobile;
                this.render();
            }
        }

        _wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
        destroy() {
            this.pages = [];
            this.totalPages = 0;
            this.pageLeft.innerHTML = '';
            this.pageRight.innerHTML = '';
            this.isAnimating = false;
        }
    }

    // ============================================================
    // 12. FEATURES
    // ============================================================

    // --- Bookmark Feature ---
    class BookmarkFeature {
        constructor(options) {
            this.db = options.db;
            this.bookId = options.bookId;
            this.panel = options.panel;
            this.listEl = options.listEl;
            this.getCurrentPage = options.getCurrentPage;
            this.goToPage = options.goToPage;
            this.showToast = options.showToast || (() => {});
            this.onChange = options.onChange || (() => {});
            this.bookmarks = [];
            this._bindEvents();
        }
        async load() {
            try {
                this.bookmarks = await this.db.bookmarks.where('bookId').equals(this.bookId).toArray();
                this.bookmarks.sort((a, b) => a.page - b.page);
                this.render();
                return this.bookmarks;
            } catch (e) { return []; }
        }
        render() {
            if (this.bookmarks.length === 0) {
                this.listEl.innerHTML = '<li style="color:var(--text-muted);font-style:italic;padding:12px 0;">Belum ada bookmark</li>';
                return;
            }
            this.listEl.innerHTML = this.bookmarks.map(bm => `
                <li data-id="${bm.id}">
                    <div class="bm-info">
                        <span>📌 Halaman ${bm.page}</span>
                        <span class="bm-page">${bm.note || ''}</span>
                    </div>
                    <button class="bm-delete" data-id="${bm.id}" title="Hapus bookmark">✕</button>
                </li>
            `).join('');
            this.listEl.querySelectorAll('li').forEach(li => {
                const id = parseInt(li.dataset.id);
                li.addEventListener('click', (e) => {
                    if (e.target.closest('.bm-delete')) return;
                    const bm = this.bookmarks.find(b => b.id === id);
                    if (bm && this.goToPage) { this.goToPage(bm.page); this.closePanel(); }
                });
            });
            this.listEl.querySelectorAll('.bm-delete').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const id = parseInt(btn.dataset.id);
                    await this.remove(id);
                });
            });
        }
        async add(page, note = '') {
            try {
                const exists = this.bookmarks.some(b => b.page === page);
                if (exists) { this.showToast('Bookmark sudah ada di halaman ini', 'info'); return null; }
                const id = await this.db.bookmarks.add({ bookId: this.bookId, page, note: note || `Halaman ${page}`, createdAt: Date.now() });
                await this.load();
                this.onChange(this.bookmarks);
                this.showToast(`🔖 Bookmark ditambahkan di halaman ${page}`, 'success');
                return id;
            } catch (e) {
                this.showToast('Gagal menambahkan bookmark', 'error');
                return null;
            }
        }
        async remove(id) {
            try {
                await this.db.bookmarks.delete(id);
                await this.load();
                this.onChange(this.bookmarks);
                this.showToast('Bookmark dihapus', 'info');
                return true;
            } catch (e) {
                this.showToast('Gagal menghapus bookmark', 'error');
                return false;
            }
        }
        async toggleCurrentPage() {
            const page = this.getCurrentPage ? this.getCurrentPage() : 1;
            const existing = this.bookmarks.find(b => b.page === page);
            if (existing) await this.remove(existing.id);
            else await this.add(page);
            return this.bookmarks;
        }
        isBookmarked(page) { return this.bookmarks.some(b => b.page === page); }
        closePanel() { this.panel.classList.remove('open'); document.getElementById('panelOverlay').classList.remove('active'); }
        _bindEvents() {
            document.getElementById('readerBookmark').addEventListener('click', () => this.toggleCurrentPage());
            document.getElementById('bookmarkAdd').addEventListener('click', () => {
                const page = this.getCurrentPage ? this.getCurrentPage() : 1;
                this.add(page);
            });
            document.getElementById('bookmarkClose').addEventListener('click', () => this.closePanel());
        }
        openPanel() { this.panel.classList.add('open'); document.getElementById('panelOverlay').classList.add('active'); this.load(); }
    }

    // --- Highlight Feature ---
    class HighlightFeature {
        constructor(options) {
            this.db = options.db;
            this.bookId = options.bookId;
            this.panel = options.panel;
            this.listEl = options.listEl;
            this.getCurrentPage = options.getCurrentPage;
            this.goToPage = options.goToPage;
            this.getPageContent = options.getPageContent;
            this.showToast = options.showToast || (() => {});
            this.onChange = options.onChange || (() => {});
            this.highlights = [];
            this._bindEvents();
        }
        async load() {
            try {
                this.highlights = await this.db.highlights.where('bookId').equals(this.bookId).toArray();
                this.highlights.sort((a, b) => a.page - b.page || a.createdAt - b.createdAt);
                this.render();
                this.applyToPage();
                return this.highlights;
            } catch (e) { return []; }
        }
        render() {
            if (this.highlights.length === 0) {
                this.listEl.innerHTML = '<li style="color:var(--text-muted);font-style:italic;padding:12px 0;">Belum ada highlight</li>';
                return;
            }
            this.listEl.innerHTML = this.highlights.map(h => `
                <li data-id="${h.id}" data-page="${h.page}">
                    <div class="hl-text">${h.text}</div>
                    <div class="hl-meta">
                        <span>📄 Halaman ${h.page}</span>
                        ${h.note ? `<span class="hl-note">${h.note}</span>` : ''}
                        <button class="hl-delete" data-id="${h.id}">✕</button>
                    </div>
                </li>
            `).join('');
            this.listEl.querySelectorAll('li').forEach(li => {
                const id = parseInt(li.dataset.id);
                const page = parseInt(li.dataset.page);
                li.addEventListener('click', (e) => {
                    if (e.target.closest('.hl-delete')) return;
                    if (this.goToPage) { this.goToPage(page); this.closePanel(); }
                });
            });
            this.listEl.querySelectorAll('.hl-delete').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const id = parseInt(btn.dataset.id);
                    await this.remove(id);
                });
            });
        }
        applyToPage() {
            const pageEls = [document.getElementById('pageLeft'), document.getElementById('pageRight')];
            pageEls.forEach(el => {
                if (!el) return;
                el.querySelectorAll('.highlight').forEach(h => {
                    const parent = h.parentNode;
                    const text = h.textContent;
                    const span = document.createElement('span');
                    span.textContent = text;
                    parent.replaceChild(span, h);
                });
                const currentPage = this.getCurrentPage ? this.getCurrentPage() : 1;
                const pageHighlights = this.highlights.filter(h => h.page === currentPage);
                if (pageHighlights.length === 0) return;
                pageHighlights.forEach(h => {
                    const text = h.text;
                    if (!text || text.length < 2) return;
                    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
                    const nodes = [];
                    let node;
                    while (node = walker.nextNode()) {
                        if (node.textContent.includes(text)) nodes.push(node);
                    }
                    nodes.forEach(node => {
                        const parent = node.parentNode;
                        if (parent.tagName === 'SPAN' && parent.classList.contains('highlight')) return;
                        const span = document.createElement('span');
                        span.className = 'highlight';
                        span.textContent = node.textContent;
                        parent.replaceChild(span, node);
                    });
                });
            });
        }
        async addHighlight(page, text, note = '') {
            if (!text || text.length < 2) { this.showToast('Teks terlalu pendek', 'error'); return null; }
            try {
                const id = await this.db.highlights.add({ bookId: this.bookId, page, text: text.substring(0, 500), note, color: '#f9e66b', createdAt: Date.now() });
                await this.load();
                this.onChange(this.highlights);
                this.showToast(`🖍️ Highlight ditambahkan di halaman ${page}`, 'success');
                return id;
            } catch (e) {
                this.showToast('Gagal menambahkan highlight', 'error');
                return null;
            }
        }
        async remove(id) {
            try {
                await this.db.highlights.delete(id);
                await this.load();
                this.onChange(this.highlights);
                this.showToast('Highlight dihapus', 'info');
                return true;
            } catch (e) {
                this.showToast('Gagal menghapus highlight', 'error');
                return false;
            }
        }
        async addNote(id, note) {
            try {
                await this.db.highlights.update(id, { note });
                await this.load();
                this.onChange(this.highlights);
                return true;
            } catch (e) { return false; }
        }
        handleTextSelection() {
            const selection = window.getSelection();
            if (!selection || selection.isCollapsed || selection.toString().trim().length < 2) return;
            const text = selection.toString().trim();
            const page = this.getCurrentPage ? this.getCurrentPage() : 1;
            const container = document.getElementById('flipbook');
            if (!container || !container.contains(selection.anchorNode)) return;
            const note = prompt(`Tambahkan catatan untuk highlight:\n\n"${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`, '');
            if (note !== null) this.addHighlight(page, text, note);
            selection.removeAllRanges();
        }
        closePanel() { this.panel.classList.remove('open'); document.getElementById('panelOverlay').classList.remove('active'); }
        _bindEvents() {
            document.getElementById('readerHighlight').addEventListener('click', () => this.openPanel());
            document.getElementById('highlightClose').addEventListener('click', () => this.closePanel());
            document.addEventListener('mouseup', () => setTimeout(() => this.handleTextSelection(), 100));
            document.addEventListener('touchend', () => setTimeout(() => this.handleTextSelection(), 300));
        }
        openPanel() { this.panel.classList.add('open'); document.getElementById('panelOverlay').classList.add('active'); this.load(); }
    }

    // --- Search Feature ---
    class SearchFeature {
        constructor(options) {
            this.panel = options.panel;
            this.input = options.input;
            this.resultsEl = options.resultsEl;
            this.getAllPages = options.getAllPages;
            this.goToPage = options.goToPage;
            this.showToast = options.showToast || (() => {});
            this.results = [];
            this._bindEvents();
        }
        async search(query) {
            if (!query || query.trim().length < 2) {
                this.resultsEl.innerHTML = '<li class="no-results">Masukkan minimal 2 karakter</li>';
                return [];
            }
            const pages = this.getAllPages ? this.getAllPages() : [];
            if (pages.length === 0) {
                this.resultsEl.innerHTML = '<li class="no-results">Tidak ada halaman untuk dicari</li>';
                return [];
            }
            const q = query.trim().toLowerCase();
            this.results = [];
            for (let i = 0; i < pages.length; i++) {
                const html = pages[i];
                if (!html) continue;
                const temp = document.createElement('div');
                temp.innerHTML = html;
                const text = temp.textContent || '';
                const lowerText = text.toLowerCase();
                let index = lowerText.indexOf(q);
                while (index !== -1) {
                    const start = Math.max(0, index - 40);
                    const end = Math.min(text.length, index + q.length + 40);
                    const context = (start > 0 ? '...' : '') + text.substring(start, end) + (end < text.length ? '...' : '');
                    this.results.push({ page: i + 1, index: i, text: context, match: text.substring(index, index + q.length) });
                    index = lowerText.indexOf(q, index + 1);
                    if (this.results.length > 500) break;
                }
                if (this.results.length > 500) break;
            }
            this.render();
            if (this.results.length === 0) this.showToast(`Tidak ditemukan hasil untuk "${query}"`, 'info');
            else this.showToast(`Ditemukan ${this.results.length} hasil untuk "${query}"`, 'success');
            return this.results;
        }
        render() {
            if (this.results.length === 0) {
                this.resultsEl.innerHTML = '<li class="no-results">Tidak ada hasil</li>';
                return;
            }
            this.resultsEl.innerHTML = this.results.map(r => `
                <li data-page="${r.page}" data-index="${r.index}">
                    <div>${r.text}</div>
                    <div class="sr-page">📄 Halaman ${r.page}</div>
                </li>
            `).join('');
            this.resultsEl.querySelectorAll('li').forEach(li => {
                const page = parseInt(li.dataset.page);
                li.addEventListener('click', () => { if (this.goToPage) { this.goToPage(page); this.closePanel(); } });
            });
        }
        clear() { this.results = []; this.resultsEl.innerHTML = '<li class="no-results">Ketik kata kunci untuk mencari</li>'; this.input.value = ''; }
        closePanel() { this.panel.classList.remove('open'); document.getElementById('panelOverlay').classList.remove('active'); this.clear(); }
        _bindEvents() {
            document.getElementById('readerSearch').addEventListener('click', () => { this.openPanel(); this.input.focus(); });
            document.getElementById('searchBtn').addEventListener('click', () => this.search(this.input.value));
            this.input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); this.search(this.input.value); }
                if (e.key === 'Escape') this.closePanel();
            });
            document.getElementById('searchClose').addEventListener('click', () => this.closePanel());
        }
        openPanel() { this.panel.classList.add('open'); document.getElementById('panelOverlay').classList.add('active'); this.input.focus(); if (this.input.value) this.search(this.input.value); }
    }

    // --- Settings Feature ---
    class SettingsFeature {
        constructor(options) {
            this.panel = options.panel;
            this.getSettings = options.getSettings || (() => ({}));
            this.saveSettings = options.saveSettings || (() => {});
            this.applySettings = options.applySettings || (() => {});
            this.showToast = options.showToast || (() => {});
            this.themeToggle = options.themeToggle || (() => {});
            this.settings = this.getSettings();
            this._bindEvents();
            this._loadUI();
        }
        _loadUI() {
            const s = this.settings;
            document.getElementById('fontSizeDisplay').textContent = s.fontSize || 16;
            document.getElementById('lhDisplay').textContent = s.lineHeight || 1.7;
            document.getElementById('marginDisplay').textContent = s.margin || 36;
            document.getElementById('fontFamilySelect').value = s.fontFamily || 'Georgia, serif';
            document.querySelectorAll('.align-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.align === (s.alignment || 'justify'));
            });
        }
        _bindEvents() {
            document.getElementById('fontDec').addEventListener('click', () => this._adjust('fontSize', -1, 10, 28));
            document.getElementById('fontInc').addEventListener('click', () => this._adjust('fontSize', 1, 10, 28));
            document.getElementById('lhDec').addEventListener('click', () => this._adjust('lineHeight', -0.1, 1.2, 2.5));
            document.getElementById('lhInc').addEventListener('click', () => this._adjust('lineHeight', 0.1, 1.2, 2.5));
            document.getElementById('marginDec').addEventListener('click', () => this._adjust('margin', -4, 10, 80));
            document.getElementById('marginInc').addEventListener('click', () => this._adjust('margin', 4, 10, 80));
            document.getElementById('fontFamilySelect').addEventListener('change', (e) => this._set('fontFamily', e.target.value));
            document.querySelectorAll('.align-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.align-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this._set('alignment', btn.dataset.align);
                });
            });
            document.querySelectorAll('.theme-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (this.themeToggle) this.themeToggle(btn.dataset.theme);
                    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                });
            });
            document.getElementById('resetSettings').addEventListener('click', () => {
                if (confirm('Reset semua pengaturan ke default?')) {
                    const defaults = { fontSize: 16, fontFamily: 'Georgia, serif', lineHeight: 1.7, margin: 36, alignment: 'justify' };
                    this.settings = defaults;
                    this.saveSettings(defaults);
                    this._loadUI();
                    this.applySettings(defaults);
                    this.showToast('Pengaturan direset ke default', 'success');
                }
            });
            document.getElementById('settingsClose').addEventListener('click', () => this.closePanel());
            document.getElementById('readerSettings').addEventListener('click', () => this.openPanel());
        }
        _adjust(key, delta, min, max) {
            const current = this.settings[key] || 0;
            let newVal = current + delta;
            if (key === 'lineHeight') newVal = Math.round(newVal * 10) / 10;
            else newVal = Math.round(newVal);
            newVal = Math.max(min, Math.min(max, newVal));
            this._set(key, newVal);
        }
        _set(key, value) {
            this.settings = { ...this.settings, [key]: value };
            this.saveSettings(this.settings);
            this._loadUI();
            this.applySettings(this.settings);
        }
        openPanel() { this.panel.classList.add('open'); document.getElementById('panelOverlay').classList.add('active'); this._loadUI(); }
        closePanel() { this.panel.classList.remove('open'); document.getElementById('panelOverlay').classList.remove('active'); }
    }

    // --- TTS Feature ---
    class TTSFeature {
        constructor(options) {
            this.getCurrentPageText = options.getCurrentPageText || (() => '');
            this.showToast = options.showToast || (() => {});
            this.getSettings = options.getSettings || (() => ({}));
            this.isPlaying = false;
            this.synth = window.speechSynthesis;
            this.utterance = null;
            this._bindEvents();
        }
        speak() {
            if (!this.synth) { this.showToast('Browser tidak mendukung Text-to-Speech', 'error'); return; }
            if (this.isPlaying) { this.stop(); return; }
            const text = this.getCurrentPageText();
            if (!text || text.trim().length < 10) { this.showToast('Teks di halaman ini terlalu pendek', 'info'); return; }
            const cleanText = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            if (cleanText.length < 10) { this.showToast('Teks di halaman ini terlalu pendek', 'info'); return; }
            if (this.synth.speaking) this.synth.cancel();
            this.utterance = new SpeechSynthesisUtterance(cleanText);
            this.utterance.lang = 'id-ID';
            this.utterance.rate = 0.9;
            this.utterance.pitch = 1.0;
            const settings = this.getSettings();
            if (settings.ttsRate) this.utterance.rate = settings.ttsRate;
            this.utterance.onstart = () => { this.isPlaying = true; this._updateButton(true); this.showToast('🔊 Membacakan...', 'info'); };
            this.utterance.onend = () => { this.isPlaying = false; this._updateButton(false); this.showToast('✅ Selesai dibacakan', 'success'); };
            this.utterance.onerror = (e) => { console.warn('TTS Error:', e); this.isPlaying = false; this._updateButton(false); this.showToast('Gagal membacakan teks', 'error'); };
            this.synth.speak(this.utterance);
        }
        stop() {
            if (this.synth) this.synth.cancel();
            this.isPlaying = false;
            this._updateButton(false);
            this.showToast('⏹️ Berhenti membacakan', 'info');
        }
        _updateButton(playing) {
            const btn = document.getElementById('readerTts');
            if (btn) { btn.textContent = playing ? '⏹️' : '🔊'; btn.title = playing ? 'Berhenti membacakan' : 'Bacakan halaman ini'; }
        }
        _bindEvents() {
            document.getElementById('readerTts').addEventListener('click', () => this.speak());
        }
    }

    // ============================================================
    // 13. READER CLASS
    // ============================================================

    let readerInstance = null;

    class Reader {
        constructor(options) {
            console.log('🔧 Reader constructor dipanggil');
            if (!options.container) throw new Error('container is required');
            if (!options.db) throw new Error('db is required');

            this.container = options.container;
            this.toolbar = options.toolbar;
            this.pageIndicator = options.pageIndicator;
            this.progressFill = options.progressFill;
            this.tocList = options.tocList;
            this.tocPanel = options.tocPanel;
            this.bookmarkPanel = options.bookmarkPanel;
            this.bookmarkList = options.bookmarkList;
            this.highlightPanel = options.highlightPanel;
            this.highlightList = options.highlightList;
            this.searchPanel = options.searchPanel;
            this.searchInput = options.searchInput;
            this.searchResults = options.searchResults;
            this.settingsPanel = options.settingsPanel;
            this.panelOverlay = options.panelOverlay;

            this.onClose = options.onClose || (() => {});
            this.onProgress = options.onProgress || (() => {});

            this.db = options.db;
            this.getBookmarks = options.getBookmarks || (() => []);
            this.addBookmark = options.addBookmark || (() => {});
            this.removeBookmark = options.removeBookmark || (() => {});
            this.getHighlights = options.getHighlights || (() => []);
            this.addHighlight = options.addHighlight || (() => {});
            this.removeHighlight = options.removeHighlight || (() => {});
            this.updateHighlight = options.updateHighlight || (() => {});
            this.getReaderSettings = options.getReaderSettings || (() => ({}));
            this.saveReaderSettings = options.saveReaderSettings || (() => {});
            this.showToast = options.showToast || (() => {});

            this.book = null;
            this.engine = null;
            this.pages = [];
            this.flipbook = null;
            this.currentPage = 0;
            this.totalPages = 0;
            this.bookId = null;
            this.isOpen = false;
            this.settings = this.getReaderSettings();

            this.bookmarkFeature = null;
            this.highlightFeature = null;
            this.searchFeature = null;
            this.settingsFeature = null;
            this.ttsFeature = null;

            this._bindEvents();
            console.log('✅ Reader constructor selesai');
        }

        async open(bookData, progressCallback = null) {
            this.book = bookData;
            this.bookId = bookData.id;
            this.onProgress = progressCallback || this.onProgress;

            try {
                this.container.classList.remove('reader-hidden');
                this.container.classList.add('reader-visible');
                this._requestFullscreen();

                this.engine = this._createEngine(bookData);
                await this.engine.load();

                const format = bookData.format.toLowerCase();
                const needsPagination = ['epub', 'txt', 'markdown'].includes(format);

                if (needsPagination) {
                    await this._paginateBook();
                } else {
                    await this._preparePDFPages();
                }

                const savedPage = await this._getSavedProgress();

                this.flipbook = new Flipbook({
                    container: document.getElementById('flipbook'),
                    pageLeft: document.getElementById('pageLeft'),
                    pageRight: document.getElementById('pageRight'),
                    onPageChange: (left, right) => this._onPageChange(left, right),
                    animationDuration: 500
                });

                this.flipbook.setPages(this.pages, savedPage);
                this._initFeatures();
                this.applySettings(this.settings);
                this._updateUI();
                this.toolbar.classList.add('visible');
                this.isOpen = true;
                this._startToolbarTimer();

            } catch (error) {
                console.error('Gagal membuka buku:', error);
                this.showToast('Gagal membuka buku: ' + error.message, 'error');
                this.close();
            }
        }

        close() {
            if (this.ttsFeature && this.ttsFeature.isPlaying) this.ttsFeature.stop();
            if (this.flipbook) { this.flipbook.destroy(); this.flipbook = null; }
            this.container.classList.remove('reader-visible');
            this.container.classList.add('reader-hidden');
            if (document.fullscreenElement) document.exitFullscreen();
            this.isOpen = false;
            this.onClose();
        }

        async next() {
            if (this.flipbook && !this.flipbook.isAnimating) await this.flipbook.next();
        }
        async prev() {
            if (this.flipbook && !this.flipbook.isAnimating) await this.flipbook.prev();
        }
        async goTo(pageNum) {
            if (this.flipbook) await this.flipbook.goTo(pageNum - 1);
        }

        toggleFullscreen() {
            if (!document.fullscreenElement) this._requestFullscreen();
            else document.exitFullscreen();
        }
        toggleToolbar() {
            this.toolbar.classList.toggle('visible');
            if (this.toolbar.classList.contains('visible')) this._startToolbarTimer();
        }

        applySettings(settings) {
            this.settings = settings;
            document.querySelectorAll('.page').forEach(el => {
                el.style.fontSize = (settings.fontSize || 16) + 'px';
                el.style.fontFamily = settings.fontFamily || 'Georgia, serif';
                el.style.lineHeight = settings.lineHeight || 1.7;
                el.style.padding = (settings.margin || 36) + 'px';
                el.style.textAlign = settings.alignment || 'justify';
            });
        }

        // Private
        _createEngine(bookData) {
            const format = bookData.format.toLowerCase();
            switch (format) {
                case 'epub': return new EPUBEngine(bookData.file);
                case 'pdf': return new PDFEngine(bookData.file);
                case 'txt': return new TXTEngine(bookData.file);
                case 'markdown':
                case 'md': return new MarkdownEngine(bookData.file);
                default: throw new Error('Format tidak didukung: ' + format);
            }
        }

        async _paginateBook() {
            let content = '';
            if (this.engine instanceof EPUBEngine) content = this.engine.getContentHTML();
            else if (this.engine instanceof TXTEngine) content = this.engine.getContentHTML();
            else if (this.engine instanceof MarkdownEngine) content = this.engine.getContentHTML();

            if (!content || content.trim().length === 0) {
                this.pages = ['<p><em>Konten kosong</em></p>'];
                this.totalPages = 1;
                return;
            }

            const wrapper = document.getElementById('flipbookWrapper');
            const rect = wrapper.getBoundingClientRect();
            const width = rect.width * 0.48;
            const height = rect.height * 0.85;
            const s = this.settings;

            const paginator = new Paginator(content, width, height, {
                fontFamily: s.fontFamily || 'Georgia, serif',
                fontSize: s.fontSize + 'px' || '16px',
                lineHeight: s.lineHeight || 1.7,
                padding: s.margin || 36,
                maxPages: 3000
            });

            this.pages = await paginator.paginate();
            this.totalPages = this.pages.length;
            await this.db.books.update(this.bookId, { totalPages: this.totalPages });
        }

        async _preparePDFPages() {
            const total = this.engine.getTotalPages();
            this.totalPages = total;
            this.pages = new Array(total).fill(null);
            for (let i = 0; i < Math.min(4, total); i++) {
                this.pages[i] = await this.engine.getPage(i + 1);
            }
            await this.db.books.update(this.bookId, { totalPages: total });
        }

        async _getSavedProgress() {
            try {
                const progress = await this.db.progress.where('bookId').equals(this.bookId).first();
                if (progress && progress.page) return Math.min(progress.page - 1, this.totalPages - 1);
            } catch (e) {}
            return 0;
        }

        _initFeatures() {
            const self = this;

            this.bookmarkFeature = new BookmarkFeature({
                db: this.db,
                bookId: this.bookId,
                panel: this.bookmarkPanel,
                listEl: this.bookmarkList,
                getCurrentPage: () => this.currentPage,
                goToPage: (page) => this.goToPage(page),
                showToast: this.showToast,
                onChange: () => {}
            });
            this.bookmarkFeature.load();

            this.highlightFeature = new HighlightFeature({
                db: this.db,
                bookId: this.bookId,
                panel: this.highlightPanel,
                listEl: this.highlightList,
                getCurrentPage: () => this.currentPage,
                goToPage: (page) => this.goToPage(page),
                getPageContent: () => {
                    const info = this.flipbook ? this.flipbook.getCurrentInfo() : { leftIndex: 0 };
                    return this.pages[info.leftIndex] || '';
                },
                showToast: this.showToast,
                onChange: () => {}
            });
            this.highlightFeature.load();

            this.searchFeature = new SearchFeature({
                panel: this.searchPanel,
                input: this.searchInput,
                resultsEl: this.searchResults,
                getAllPages: () => this.pages,
                goToPage: (page) => this.goToPage(page),
                showToast: this.showToast
            });

            this.settingsFeature = new SettingsFeature({
                panel: this.settingsPanel,
                getSettings: () => this.settings,
                saveSettings: (settings) => {
                    this.settings = settings;
                    this.saveReaderSettings(settings);
                    this.applySettings(settings);
                },
                applySettings: (settings) => this.applySettings(settings),
                showToast: this.showToast,
                themeToggle: (theme) => {
                    if (window.__Papyrus && window.__Papyrus.applyTheme) {
                        window.__Papyrus.applyTheme(theme);
                    }
                }
            });

            this.ttsFeature = new TTSFeature({
                getCurrentPageText: () => {
                    const info = this.flipbook ? this.flipbook.getCurrentInfo() : { leftIndex: 0 };
                    const html = this.pages[info.leftIndex] || '';
                    const temp = document.createElement('div');
                    temp.innerHTML = html;
                    return temp.textContent || '';
                },
                showToast: this.showToast,
                getSettings: () => this.settings
            });

            document.getElementById('readerToc').addEventListener('click', () => {
                this._togglePanel(this.tocPanel);
                this._renderTOC();
            });
            document.getElementById('readerBookmark').addEventListener('click', () => {
                if (this.bookmarkFeature) this.bookmarkFeature.openPanel();
            });
            document.getElementById('readerHighlight').addEventListener('click', () => {
                if (this.highlightFeature) this.highlightFeature.openPanel();
            });
            document.getElementById('readerSearch').addEventListener('click', () => {
                if (this.searchFeature) this.searchFeature.openPanel();
            });
            document.getElementById('readerSettings').addEventListener('click', () => {
                if (this.settingsFeature) this.settingsFeature.openPanel();
            });
            document.getElementById('readerTts').addEventListener('click', () => {
                if (this.ttsFeature) this.ttsFeature.speak();
            });
        }

        _onPageChange(leftIdx, rightIdx) {
            const pageNum = leftIdx + 1;
            this.currentPage = pageNum;
            this._updateUI();
            this._saveProgress();
            if (this.highlightFeature) {
                setTimeout(() => this.highlightFeature.applyToPage(), 100);
            }
        }

        _updateUI() {
            const info = this.flipbook ? this.flipbook.getCurrentInfo() : { leftPage: 1, totalPages: 1 };
            this.pageIndicator.textContent = `Hal ${info.leftPage} / ${info.totalPages}`;
            const progress = this.totalPages > 0 ? (info.leftPage / this.totalPages) * 100 : 0;
            this.progressFill.style.width = Math.min(progress, 100) + '%';
            this._renderTOC();
        }

        _renderTOC() {
            const toc = this.engine.getTOC();
            this.tocList.innerHTML = '';
            if (toc && toc.length > 0) {
                toc.forEach((item, index) => {
                    const li = document.createElement('li');
                    li.textContent = item.label || `Bab ${index + 1}`;
                    li.addEventListener('click', () => {
                        const targetPage = Math.floor((index / toc.length) * this.totalPages);
                        this.goTo(targetPage + 1);
                        this._closePanel();
                    });
                    this.tocList.appendChild(li);
                });
            } else {
                this.tocList.innerHTML = '<li style="color:var(--text-muted);font-style:italic;">Tidak ada daftar isi</li>';
            }
        }

        async _saveProgress() {
            if (!this.bookId || !this.totalPages) return;
            try {
                await this.db.progress.where('bookId').equals(this.bookId).delete();
                await this.db.progress.add({
                    bookId: this.bookId,
                    page: this.currentPage,
                    percentage: Math.round((this.currentPage / this.totalPages) * 100),
                    lastReadAt: Date.now()
                });
                await this.db.books.update(this.bookId, { lastRead: Date.now() });
                this.onProgress(this.bookId, this.currentPage, this.totalPages);
            } catch (e) {}
        }

        _requestFullscreen() {
            try {
                const el = this.container;
                if (el.requestFullscreen) el.requestFullscreen();
                else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
            } catch (e) {}
        }

        _startToolbarTimer() {
            if (this._toolbarTimer) clearTimeout(this._toolbarTimer);
            this._toolbarTimer = setTimeout(() => this.toolbar.classList.remove('visible'), 3000);
        }

        _togglePanel(panel) {
            const isOpen = panel.classList.contains('open');
            this._closeAllPanels();
            if (!isOpen) { panel.classList.add('open'); this.panelOverlay.classList.add('active'); }
        }
        _closePanel() { this._closeAllPanels(); }
        _closeAllPanels() {
            document.querySelectorAll('.side-panel').forEach(p => p.classList.remove('open'));
            this.panelOverlay.classList.remove('active');
        }

        _bindEvents() {
            document.addEventListener('keydown', (e) => {
                if (!this.isOpen) return;
                if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); this.next(); }
                else if (e.key === 'ArrowLeft') { e.preventDefault(); this.prev(); }
                else if (e.key === 'f' || e.key === 'F') this.toggleFullscreen();
                else if (e.key === 'Escape') this.close();
                else if (e.ctrlKey && e.key === 'f') { e.preventDefault(); if (this.searchFeature) this.searchFeature.openPanel(); }
            });

            document.getElementById('tapLeft').addEventListener('click', () => this.prev());
            document.getElementById('tapRight').addEventListener('click', () => this.next());
            document.getElementById('tapCenter').addEventListener('click', () => this.toggleToolbar());
            document.getElementById('readerBack').addEventListener('click', () => this.close());
            document.getElementById('readerFullscreen').addEventListener('click', () => this.toggleFullscreen());
            this.panelOverlay.addEventListener('click', () => this._closeAllPanels());
            window.addEventListener('resize', () => { if (this.flipbook) this.flipbook.updateLayout(); });
            document.getElementById('flipbookWrapper').addEventListener('wheel', (e) => {
                if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) e.preventDefault();
            }, { passive: false });
        }
    }

    // ============================================================
    // 14. OPEN READER FUNCTION
    // ============================================================

    async function openReader(bookId) {
        console.log('📖 Membuka buku ID:', bookId);
        try {
            const book = await getBook(bookId);
            if (!book) {
                showToast('Buku tidak ditemukan', 'error');
                return;
            }
            console.log('📚 Data buku:', book.title, book.format);

            if (readerInstance) {
                readerInstance.close();
                readerInstance = null;
            }

            const container = document.getElementById('reader-container');
            if (!container) {
                showToast('Error: reader-container tidak ditemukan', 'error');
                return;
            }

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
                    readerInstance = null;
                    renderLibrary();
                    updateFooterStats();
                },
                onProgress: async () => renderLibrary(),
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

            await readerInstance.open(book);
            console.log('✅ Buku berhasil dibuka');

        } catch (error) {
            console.error('❌ Gagal membuka buku:', error);
            showToast('Gagal membuka buku: ' + error.message, 'error');
            if (readerInstance) { readerInstance.close(); readerInstance = null; }
        }
    }

    // ============================================================
    // 15. FOOTER STATS
    // ============================================================

    async function updateFooterStats() {
        const books = await getAllBooks();
        const totalBooks = books.length;
        const totalPages = books.reduce((sum, b) => sum + (b.totalPages || 0), 0);
        dom.footerStats.textContent = `${totalBooks} buku · ${totalPages} halaman`;
    }

    // ============================================================
    // 16. EVENT BINDING
    // ============================================================

    dom.themeToggle.addEventListener('click', toggleTheme);

    dom.uploadBtn.addEventListener('click', () => dom.fileInput.click());
    dom.emptyUploadBtn.addEventListener('click', () => dom.fileInput.click());

    dom.fileInput.addEventListener('change', async (e) => {
        const files = e.target.files;
        if (files.length === 0) return;
        for (const file of files) await handleFileUpload(file);
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
        for (const file of files) await handleFileUpload(file);
    });
    dom.dropzone.addEventListener('click', (e) => {
        if (e.target === dom.dropzone || e.target.closest('.dropzone-content')) {
            dom.fileInput.click();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'o') { e.preventDefault(); dom.fileInput.click(); }
        if (e.ctrlKey && e.shiftKey && e.key === 'D') { e.preventDefault(); toggleTheme(); }
    });

    // ============================================================
    // 17. INIT
    // ============================================================

    async function init() {
        try {
            loadTheme();
            getReaderSettings();
            await renderLibrary();
            await updateFooterStats();
            console.log('📖 Papyrus Reader - Single File siap!');
        } catch (error) {
            console.error('Gagal inisialisasi:', error);
            showToast('Gagal memuat aplikasi', 'error');
        }
    }

    // Ekspos ke global
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
        applyTheme,
        Reader,
        Flipbook,
        Paginator,
        EPUBEngine,
        PDFEngine,
        TXTEngine,
        MarkdownEngine
    };

    init();

})();