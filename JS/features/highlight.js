/* ========================================
   Highlight & Notes Feature
   ======================================== */

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
        this._selectedText = '';
        this._isSelecting = false;
        this._bindEvents();
    }

    async load() {
        try {
            this.highlights = await this.db.highlights
                .where('bookId')
                .equals(this.bookId)
                .toArray();
            this.highlights.sort((a, b) => a.page - b.page || a.createdAt - b.createdAt);
            this.render();
            this.applyToPage();
            return this.highlights;
        } catch (e) {
            console.error('Gagal load highlight:', e);
            return [];
        }
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

        // Event untuk klik highlight
        this.listEl.querySelectorAll('li').forEach(li => {
            const id = parseInt(li.dataset.id);
            const page = parseInt(li.dataset.page);
            li.addEventListener('click', (e) => {
                if (e.target.closest('.hl-delete')) return;
                if (this.goToPage) {
                    this.goToPage(page);
                    this.closePanel();
                }
            });
        });

        // Event untuk hapus
        this.listEl.querySelectorAll('.hl-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                await this.remove(id);
            });
        });
    }

    applyToPage() {
        // Aplikasikan highlight ke halaman saat ini
        const pageEls = [document.getElementById('pageLeft'), document.getElementById('pageRight')];
        pageEls.forEach(el => {
            if (!el) return;
            // Hapus highlight lama
            el.querySelectorAll('.highlight').forEach(h => {
                const parent = h.parentNode;
                const text = h.textContent;
                const span = document.createElement('span');
                span.textContent = text;
                parent.replaceChild(span, h);
            });

            // Tambahkan highlight baru untuk halaman ini
            const currentPage = this.getCurrentPage ? this.getCurrentPage() : 1;
            const pageHighlights = this.highlights.filter(h => h.page === currentPage);
            if (pageHighlights.length === 0) return;

            // Cari teks dan highlight
            pageHighlights.forEach(h => {
                const text = h.text;
                if (!text || text.length < 2) return;
                // Cari di dalam elemen
                const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
                const nodes = [];
                let node;
                while (node = walker.nextNode()) {
                    if (node.textContent.includes(text)) {
                        nodes.push(node);
                    }
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
        if (!text || text.length < 2) {
            this.showToast('Teks terlalu pendek untuk di-highlight', 'error');
            return null;
        }

        try {
            const id = await this.db.highlights.add({
                bookId: this.bookId,
                page: page,
                text: text.substring(0, 500),
                note: note,
                color: '#f9e66b',
                createdAt: Date.now()
            });

            await this.load();
            this.onChange(this.highlights);
            this.showToast(`🖍️ Highlight ditambahkan di halaman ${page}`, 'success');
            return id;

        } catch (e) {
            console.error('Gagal add highlight:', e);
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
            console.error('Gagal remove highlight:', e);
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
        } catch (e) {
            console.error('Gagal add note:', e);
            return false;
        }
    }

    handleTextSelection() {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.toString().trim().length < 2) {
            return;
        }

        const text = selection.toString().trim();
        const page = this.getCurrentPage ? this.getCurrentPage() : 1;

        // Cek apakah seleksi di dalam halaman reader
        const container = document.getElementById('flipbook');
        if (!container || !container.contains(selection.anchorNode)) {
            return;
        }

        // Tampilkan konfirmasi
        const note = prompt(`Tambahkan catatan untuk highlight:\n\n"${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`, '');
        if (note !== null) {
            this.addHighlight(page, text, note);
        }

        selection.removeAllRanges();
    }

    closePanel() {
        this.panel.classList.remove('open');
        document.getElementById('panelOverlay').classList.remove('active');
    }

    _bindEvents() {
        // Tombol highlight di toolbar
        const btn = document.getElementById('readerHighlight');
        if (btn) {
            btn.addEventListener('click', () => {
                this.openPanel();
            });
        }

        // Close button
        const closeBtn = document.getElementById('highlightClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closePanel());
        }

        // Selection handler
        document.addEventListener('mouseup', (e) => {
            // Cek apakah dalam reader
            const container = document.getElementById('reader-container');
            if (!container || container.classList.contains('reader-hidden')) return;
            // Delay untuk menghindari konflik dengan click events
            setTimeout(() => {
                this.handleTextSelection();
            }, 100);
        });

        document.addEventListener('touchend', (e) => {
            const container = document.getElementById('reader-container');
            if (!container || container.classList.contains('reader-hidden')) return;
            setTimeout(() => {
                this.handleTextSelection();
            }, 300);
        });

        // Panel toggle (dari reader.js)
    }

    openPanel() {
        this.panel.classList.add('open');
        document.getElementById('panelOverlay').classList.add('active');
        this.load();
    }
}