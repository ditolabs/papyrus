/* ========================================
   TXT Engine
   ======================================== */

class TXTEngine extends BaseEngine {
    constructor(file) {
        super(file);
        this.content = '';
        this.paragraphs = [];
    }

    async load() {
        try {
            const text = await this.file.text();
            this.content = text;

            this.paragraphs = text
                .split(/\n\s*\n/)
                .map(p => p.trim())
                .filter(p => p.length > 0);

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
            console.error('Gagal load TXT:', error);
            throw new Error('Gagal memuat file teks: ' + error.message);
        }
    }

    getContentHTML() {
        return this.paragraphs
            .map(p => `<p>${this.escapeHTML(p)}</p>`)
            .join('');
    }

    escapeHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async getPage(pageNum) {
        return this.getContentHTML();
    }
}