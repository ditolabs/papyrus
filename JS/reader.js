/* ========================================
   Reader - Main Reader Controller
   Fase 3: + Bookmark, Highlight, Search, Settings, TTS
   ======================================== */

class Reader {
    constructor(options) {
        // DOM refs
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

        // Callbacks
        this.onClose = options.onClose || (() => {});
        this.onProgress = options.onProgress || (() => {});

        // DB & Helpers
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

        // State
        this.book = null;
        this.engine = null;
        this.pages = [];
        this.flipbook = null;
        this.currentPage = 0;
        this.totalPages = 0;
        this.bookId = null;
        this.isOpen = false;
        this.settings = this.getReaderSettings();

        // Features
        this.bookmarkFeature = null;
        this.highlightFeature = null;
        this.searchFeature = null;
        this.settingsFeature = null;
        this.ttsFeature = null;

        // Bind events
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

            // Init engine
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

            // Init flipbook
            this.flipbook = new Flipbook({
                container: document.getElementById('flipbook'),
                pageLeft: document.getElementById('pageLeft'),
                pageRight: document.getElementById('pageRight'),
                onPageChange: (left, right) => this._onPageChange(left, right),
                animationDuration: 500
            });

            this.flipbook.setPages(this.pages, savedPage);

            // Init features
            this._initFeatures();

            // Apply settings
            this.applySettings(this.settings);

            // Update UI
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
        // Stop TTS jika berjalan
        if (this.ttsFeature && this.ttsFeature.isPlaying) {
            this.ttsFeature.stop();
        }

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

    applySettings(settings) {
        this.settings = settings;
        const pages = document.querySelectorAll('.page');
        pages.forEach(el => {
            el.style.fontSize = (settings.fontSize || 16) + 'px';
            el.style.fontFamily = settings.fontFamily || 'Georgia, serif';
            el.style.lineHeight = settings.lineHeight || 1.7;
            el.style.padding = (settings.margin || 36) + 'px';
            el.style.textAlign = settings.alignment || 'justify';
        });

        // Re-paginate jika perlu? Untuk sederhana, kita update style saja.
        // Untuk paginasi ulang butuh rebuild yang kompleks.
    }

    // ==================== Private Methods ====================

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
            if (progress && progress.page) {
                return Math.min(progress.page - 1, this.totalPages - 1);
            }
        } catch (e) {}
        return 0;
    }

    _initFeatures() {
        const self = this;

        // Bookmark
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

        // Highlight
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

        // Search
        this.searchFeature = new SearchFeature({
            panel: this.searchPanel,
            input: this.searchInput,
            resultsEl: this.searchResults,
            getAllPages: () => this.pages,
            goToPage: (page) => this.goToPage(page),
            showToast: this.showToast
        });

        // Settings
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
                // Panggil fungsi theme dari app.js
                if (window.__Papyrus && window.__Papyrus.applyTheme) {
                    window.__Papyrus.applyTheme(theme);
                }
            }
        });

        // TTS
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

        // Bind panel toggles dari toolbar
        document.getElementById('readerToc').addEventListener('click', () => {
            this._togglePanel(this.tocPanel);
            this._renderTOC();
        });

        document.getElementById('readerBookmark').addEventListener('click', () => {
            if (this.bookmarkFeature) {
                this.bookmarkFeature.openPanel();
            }
        });

        document.getElementById('readerHighlight').addEventListener('click', () => {
            if (this.highlightFeature) {
                this.highlightFeature.openPanel();
            }
        });

        document.getElementById('readerSearch').addEventListener('click', () => {
            if (this.searchFeature) {
                this.searchFeature.openPanel();
            }
        });

        document.getElementById('readerSettings').addEventListener('click', () => {
            if (this.settingsFeature) {
                this.settingsFeature.openPanel();
            }
        });

        document.getElementById('readerTts').addEventListener('click', () => {
            if (this.ttsFeature) {
                this.ttsFeature.speak();
            }
        });
    }

    _onPageChange(leftIdx, rightIdx) {
        const pageNum = leftIdx + 1;
        this.currentPage = pageNum;

        this._updateUI();
        this._saveProgress();

        // Update highlight di halaman
        if (this.highlightFeature) {
            setTimeout(() => {
                this.highlightFeature.applyToPage();
            }, 100);
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

    _togglePanel(panel) {
        const isOpen = panel.classList.contains('open');
        this._closeAllPanels();
        if (!isOpen) {
            panel.classList.add('open');
            this.panelOverlay.classList.add('active');
        }
    }

    _closePanel() {
        this._closeAllPanels();
    }

    _closeAllPanels() {
        document.querySelectorAll('.side-panel').forEach(p => p.classList.remove('open'));
        this.panelOverlay.classList.remove('active');
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
            } else if (e.ctrlKey && e.key === 'f') {
                e.preventDefault();
                if (this.searchFeature) {
                    this.searchFeature.openPanel();
                }
            }
        });

        document.getElementById('tapLeft').addEventListener('click', () => this.prev());
        document.getElementById('tapRight').addEventListener('click', () => this.next());
        document.getElementById('tapCenter').addEventListener('click', () => this.toggleToolbar());

        document.getElementById('readerBack').addEventListener('click', () => this.close());
        document.getElementById('readerFullscreen').addEventListener('click', () => this.toggleFullscreen());

        // Panel overlay close
        this.panelOverlay.addEventListener('click', () => this._closeAllPanels());

        window.addEventListener('resize', () => {
            if (this.flipbook) {
                this.flipbook.updateLayout();
            }
        });

        // Mouse wheel horizontal scroll prevention
        document.getElementById('flipbookWrapper').addEventListener('wheel', (e) => {
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                e.preventDefault();
            }
        }, { passive: false });
    }
}