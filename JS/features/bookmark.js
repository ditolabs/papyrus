/* ========================================
   Bookmark Feature
   ======================================== */

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
            this.bookmarks = await this.db.bookmarks
                .where('bookId')
                .equals(this.bookId)
                .toArray();
            this.bookmarks.sort((a, b) => a.page - b.page);
            this.render();
            return this.bookmarks;
        } catch (e) {
            console.error('Gagal load bookmark:', e);
            return [];
        }
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

        // Event untuk klik bookmark
        this.listEl.querySelectorAll('li').forEach(li => {
            const id = parseInt(li.dataset.id);
            li.addEventListener('click', (e) => {
                if (e.target.closest('.bm-delete')) return;
                const bm = this.bookmarks.find(b => b.id === id);
                if (bm && this.goToPage) {
                    this.goToPage(bm.page);
                    this.closePanel();
                }
            });
        });

        // Event untuk hapus
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
            // Cek duplikat
            const exists = this.bookmarks.some(b => b.page === page);
            if (exists) {
                this.showToast('Bookmark sudah ada di halaman ini', 'info');
                return null;
            }

            const id = await this.db.bookmarks.add({
                bookId: this.bookId,
                page: page,
                note: note || `Halaman ${page}`,
                createdAt: Date.now()
            });

            await this.load();
            this.onChange(this.bookmarks);
            this.showToast(`🔖 Bookmark ditambahkan di halaman ${page}`, 'success');
            return id;

        } catch (e) {
            console.error('Gagal add bookmark:', e);
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
            console.error('Gagal remove bookmark:', e);
            this.showToast('Gagal menghapus bookmark', 'error');
            return false;
        }
    }

    async toggleCurrentPage() {
        const page = this.getCurrentPage ? this.getCurrentPage() : 1;
        const existing = this.bookmarks.find(b => b.page === page);
        if (existing) {
            await this.remove(existing.id);
        } else {
            await this.add(page);
        }
        return this.bookmarks;
    }

    isBookmarked(page) {
        return this.bookmarks.some(b => b.page === page);
    }

    closePanel() {
        this.panel.classList.remove('open');
        document.getElementById('panelOverlay').classList.remove('active');
    }

    _bindEvents() {
        // Tombol bookmark di toolbar
        const btn = document.getElementById('readerBookmark');
        if (btn) {
            btn.addEventListener('click', () => {
                this.toggleCurrentPage();
            });
        }

        // Tombol add di panel
        const addBtn = document.getElementById('bookmarkAdd');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                const page = this.getCurrentPage ? this.getCurrentPage() : 1;
                this.add(page);
            });
        }

        // Close button
        const closeBtn = document.getElementById('bookmarkClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closePanel());
        }

        // Panel toggle (dari toolbar)
        // Event listener akan di-bind dari reader.js
    }

    openPanel() {
        this.panel.classList.add('open');
        document.getElementById('panelOverlay').classList.add('active');
        this.load();
    }
}