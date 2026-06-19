/* ========================================
   Reader - Main Reader Controller
   ======================================== */

class Reader {
    constructor(options) {
        this.container = options.container;
        this.toolbar = options.toolbar;
        this.pageIndicator = options.pageIndicator;
        this.progressFill = options.progressFill;
        this.tocList = options.tocList;
        this.tocPanel = options.tocPanel;
        this.panelOverlay = options.panelOverlay;

        this.onClose = options.onClose || (() => {});
        this.onProgress = options.onProgress || (() => {});

        this.book = null;
        this.engine = null;
        this.pages = [];
        this.flipbook = null;
        this.currentPage = 0;
        this.totalPages = 0;
        this.bookId = null;
        this.isOpen = false;

        this._bindEvents();
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

            this._updateUI();
            this.toolbar.classList.add('visible');

            this.isOpen = true;
            this._startToolbarTimer();

        } catch (error) {
            console.error('Gagal membuka buku:', error);
            this._showError('Gagal membuka buku: ' + error.message);
            this.close();
        }
    }

    close() {
        if (this.flipbook) {
            this.flipbook.destroy();
            this.flipbook = null;
        }

        this.container.classList.remove('reader-visible');
        this.container.classList.add('reader-hidden');

        if (document.fullscreenElement) {
            document.exitFullscreen();
        }

        this.isOpen = false;
        this.onClose();
    }

    async next() {
        if (this.flipbook && !this.flipbook.isAnimating) {
            await this.flipbook.next();
        }
    }

    async prev() {
        if (this.flipbook && !this.flipbook.isAnimating) {
            await this.flipbook.prev();
        }
    }

    async goTo(pageNum) {
        if (this.flipbook) {
            await this.flipbook.goTo(pageNum - 1);
        }
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            this._requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }

    toggleToolbar() {
        this.toolbar.classList.toggle('visible');
        if (this.toolbar.classList.contains('visible')) {
            this._startToolbarTimer();
        }
    }

    // ==================== Private Methods ====================

    _createEngine(bookData) {
        const format = bookData.format.toLowerCase();
        switch (format) {
            case 'epub':
                return new EPUBEngine(bookData.file);
            case 'pdf':
                return new PDFEngine(bookData.file);
            case 'txt':
                return new TXTEngine(bookData.file);
            case 'markdown':
            case 'md':
                return new MarkdownEngine(bookData.file);
            default:
                throw new Error('Format tidak didukung: ' + format);
        }
    }

    async _paginateBook() {
        let content = '';
        if (this.engine instanceof EPUBEngine) {
            content = this.engine.getContentHTML();
        } else if (this.engine instanceof TXTEngine) {
            content = this.engine.getContentHTML();
        } else if (this.engine instanceof MarkdownEngine) {
            content = this.engine.getContentHTML();
        }

        if (!content || content.trim().length === 0) {
            this.pages = ['<p><em>Konten kosong</em></p>'];
            this.totalPages = 1;
            return;
        }

        const wrapper = document.getElementById('flipbookWrapper');
        const rect = wrapper.getBoundingClientRect();
        const width = rect.width * 0.48;
        const height = rect.height * 0.85;

        const paginator = new Paginator(content, width, height, {
            fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--font-reader') || 'Georgia, serif',
            fontSize: '16px',
            lineHeight: 1.7,
            padding: 36,
            maxPages: 3000
        });

        this.pages = await paginator.paginate();
        this.totalPages = this.pages.length;

        await db.books.update(this.bookId, { totalPages: this.totalPages });
    }

    async _preparePDFPages() {
        const total = this.engine.getTotalPages();
        this.totalPages = total;

        this.pages = new Array(total).fill(null);

        for (let i = 0; i < Math.min(4, total); i++) {
            this.pages[i] = await this.engine.getPage(i + 1);
        }

        await db.books.update(this.bookId, { totalPages: total });
    }

    async _getSavedProgress() {
        try {
            const progress = await db.progress.where('bookId').equals(this.bookId).first();
            if (progress && progress.page) {
                return Math.min(progress.page - 1, this.totalPages - 1);
            }
        } catch (e) {
            console.warn('Gagal load progress:', e);
        }
        return 0;
    }

    _onPageChange(leftIdx, rightIdx) {
        const pageNum = leftIdx + 1;
        this.currentPage = pageNum;

        this._updateUI();
        this._saveProgress();
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
            await saveProgress(this.bookId, this.currentPage, this.totalPages);
            this.onProgress(this.bookId, this.currentPage, this.totalPages);
        } catch (e) {
            console.warn('Gagal save progress:', e);
        }
    }

    _requestFullscreen() {
        try {
            const el = this.container;
            if (el.requestFullscreen) {
                el.requestFullscreen();
            } else if (el.webkitRequestFullscreen) {
                el.webkitRequestFullscreen();
            }
        } catch (e) {}
    }

    _startToolbarTimer() {
        if (this._toolbarTimer) clearTimeout(this._toolbarTimer);
        this._toolbarTimer = setTimeout(() => {
            this.toolbar.classList.remove('visible');
        }, 3000);
    }

    _bindEvents() {
        document.addEventListener('keydown', (e) => {
            if (!this.isOpen) return;

            if (e.key === 'ArrowRight' || e.key === ' ') {
                e.preventDefault();
                this.next();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                this.prev();
            } else if (e.key === 'f' || e.key === 'F') {
                this.toggleFullscreen();
            } else if (e.key === 'Escape') {
                this.close();
            }
        });

        document.getElementById('tapLeft').addEventListener('click', () => this.prev());
        document.getElementById('tapRight').addEventListener('click', () => this.next());
        document.getElementById('tapCenter').addEventListener('click', () => this.toggleToolbar());

        document.getElementById('readerBack').addEventListener('click', () => this.close());
        document.getElementById('readerFullscreen').addEventListener('click', () => this.toggleFullscreen());
        document.getElementById('readerToc').addEventListener('click', () => this._togglePanel());
        document.getElementById('tocClose').addEventListener('click', () => this._closePanel());
        document.getElementById('panelOverlay').addEventListener('click', () => this._closePanel());

        document.getElementById('readerBookmark').addEventListener('click', () => {
            const info = this.flipbook ? this.flipbook.getCurrentInfo() : { leftPage: 1 };
            alert(`🔖 Halaman ${info.leftPage} ditandai! (Fitur bookmark akan hadir di Fase 3)`);
        });

        document.getElementById('readerSettings').addEventListener('click', () => {
            alert('⚙️ Pengaturan font & tema akan hadir di Fase 3');
        });

        window.addEventListener('resize', () => {
            if (this.flipbook) {
                this.flipbook.updateLayout();
            }
        });
    }

    _togglePanel() {
        this.tocPanel.classList.toggle('open');
        this.panelOverlay.classList.toggle('active');
    }

    _closePanel() {
        this.tocPanel.classList.remove('open');
        this.panelOverlay.classList.remove('active');
    }

    _showError(message) {
        alert('❌ ' + message);
    }
}