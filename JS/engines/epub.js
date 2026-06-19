/* ========================================
   EPUB Engine (ePub.js)
   ======================================== */

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
                } catch (e) {
                    console.warn('Gagal memuat section:', item.href, e);
                }
            }

            this.rawContent = fullHTML;
            this.totalPages = 0;
            this.loaded = true;

            return this;

        } catch (error) {
            console.error('Gagal load EPUB:', error);
            throw new Error('Gagal memuat file EPUB: ' + error.message);
        }
    }

    async getPage(pageNum) {
        return this.rawContent;
    }

    getContentHTML() {
        return this.rawContent;
    }

    getSpineItems() {
        return this.spineItems;
    }

    async getCoverDataURL() {
        try {
            const url = await this.book.coverUrl();
            if (url) {
                const response = await fetch(url);
                const blob = await response.blob();
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
            }
        } catch (e) {
            return null;
        }
        return null;
    }
}