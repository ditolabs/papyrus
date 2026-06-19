/* ========================================
   Markdown Engine
   ======================================== */

class MarkdownEngine extends BaseEngine {
    constructor(file) {
        super(file);
        this.content = '';
        this.htmlContent = '';
    }

    async load() {
        try {
            const text = await this.file.text();
            this.content = text;
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
            console.error('Gagal load Markdown:', error);
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

    getContentHTML() {
        return this.htmlContent;
    }

    async getPage(pageNum) {
        return this.htmlContent;
    }
}