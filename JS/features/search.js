/* ========================================
   In-Book Search Feature
   ======================================== */

class SearchFeature {
    constructor(options) {
        this.panel = options.panel;
        this.input = options.input;
        this.resultsEl = options.resultsEl;
        this.getAllPages = options.getAllPages;
        this.goToPage = options.goToPage;
        this.showToast = options.showToast || (() => {});
        this.highlightResults = options.highlightResults || false;

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

        // Cari di setiap halaman
        for (let i = 0; i < pages.length; i++) {
            const html = pages[i];
            if (!html) continue;

            // Ekstrak teks dari HTML
            const temp = document.createElement('div');
            temp.innerHTML = html;
            const text = temp.textContent || '';
            const lowerText = text.toLowerCase();

            // Cari semua kemunculan
            let index = lowerText.indexOf(q);
            while (index !== -1) {
                const start = Math.max(0, index - 40);
                const end = Math.min(text.length, index + q.length + 40);
                const context = (start > 0 ? '...' : '') + 
                    text.substring(start, end) + 
                    (end < text.length ? '...' : '');
                
                this.results.push({
                    page: i + 1,
                    index: i,
                    text: context,
                    match: text.substring(index, index + q.length)
                });

                index = lowerText.indexOf(q, index + 1);
                if (this.results.length > 500) break;
            }

            if (this.results.length > 500) break;
        }

        this.render();

        if (this.results.length === 0) {
            this.showToast(`Tidak ditemukan hasil untuk "${query}"`, 'info');
        } else {
            this.showToast(`Ditemukan ${this.results.length} hasil untuk "${query}"`, 'success');
        }

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

        // Event klik
        this.resultsEl.querySelectorAll('li').forEach(li => {
            const page = parseInt(li.dataset.page);
            li.addEventListener('click', () => {
                if (this.goToPage) {
                    this.goToPage(page);
                    this.closePanel();
                }
            });
        });
    }

    clear() {
        this.results = [];
        this.resultsEl.innerHTML = '<li class="no-results">Ketik kata kunci untuk mencari</li>';
        this.input.value = '';
    }

    closePanel() {
        this.panel.classList.remove('open');
        document.getElementById('panelOverlay').classList.remove('active');
        this.clear();
    }

    _bindEvents() {
        // Tombol search di toolbar
        const btn = document.getElementById('readerSearch');
        if (btn) {
            btn.addEventListener('click', () => {
                this.openPanel();
                this.input.focus();
            });
        }

        // Tombol cari
        const searchBtn = document.getElementById('searchBtn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                this.search(this.input.value);
            });
        }

        // Enter di input
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.search(this.input.value);
            }
            if (e.key === 'Escape') {
                this.closePanel();
            }
        });

        // Close button
        const closeBtn = document.getElementById('searchClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closePanel());
        }

        // Panel overlay
        document.getElementById('panelOverlay').addEventListener('click', () => {
            this.closePanel();
        });
    }

    openPanel() {
        this.panel.classList.add('open');
        document.getElementById('panelOverlay').classList.add('active');
        this.input.focus();
        if (this.input.value) {
            this.search(this.input.value);
        }
    }
}