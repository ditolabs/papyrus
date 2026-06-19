/* ========================================
   PDF Engine (PDF.js)
   ======================================== */

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
            console.error('Gagal load PDF:', error);
            throw new Error('Gagal memuat file PDF: ' + error.message);
        }
    }

    async getPage(pageNum) {
        if (!this.pdfDoc) throw new Error('PDF belum dimuat');
        if (pageNum < 1 || pageNum > this.totalPages) {
            throw new Error('Halaman tidak valid');
        }

        try {
            const page = await this.pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: this.scale });

            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            const ctx = canvas.getContext('2d');
            const renderContext = {
                canvasContext: ctx,
                viewport: viewport
            };

            await page.render(renderContext).promise;
            return canvas.toDataURL('image/jpeg', 0.92);

        } catch (error) {
            console.error('Gagal render halaman PDF:', pageNum, error);
            return null;
        }
    }

    setScale(scale) {
        this.scale = Math.max(0.5, Math.min(3, scale));
    }

    getScale() {
        return this.scale;
    }
}