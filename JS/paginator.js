/* ========================================
   Paginator - Split content into pages
   ======================================== */

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
            position: absolute;
            left: -9999px;
            top: 0;
            width: ${w}px;
            height: ${h}px;
            overflow: hidden;
            font-family: ${this.fontFamily};
            font-size: ${this.fontSize};
            line-height: ${this.lineHeight};
            padding: 0;
            box-sizing: border-box;
            word-wrap: break-word;
            white-space: normal;
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

        let low = 0;
        let high = children.length - 1;
        let result = 0;

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

    getPageCount() {
        return this.pages.length;
    }

    getPage(index) {
        if (index >= 0 && index < this.pages.length) {
            return this.pages[index];
        }
        return null;
    }
}