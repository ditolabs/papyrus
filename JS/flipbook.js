/* ========================================
   Flipbook - Page Flip Animation
   ======================================== */

class Flipbook {
    constructor(options) {
        this.container = options.container;
        this.pageLeft = options.pageLeft;
        this.pageRight = options.pageRight;
        this.onPageChange = options.onPageChange || (() => {});
        this.duration = options.animationDuration || 500;

        this.totalPages = 0;
        this.currentSpread = 0;
        this.isAnimating = false;
        this.pages = [];
        this.isSinglePage = window.innerWidth < 768;
    }

    setPages(pages, startPage = 0) {
        this.pages = pages;
        this.totalPages = pages.length;
        this.currentSpread = Math.min(startPage, this.totalPages - 1);

        if (this.currentSpread % 2 !== 0) {
            this.currentSpread -= 1;
        }
        if (this.currentSpread < 0) this.currentSpread = 0;

        this.render();
    }

    render() {
        const leftIdx = this.currentSpread;
        const rightIdx = this.currentSpread + 1;

        this.pageLeft.innerHTML = this.getPageHTML(leftIdx);
        this.pageRight.innerHTML = this.getPageHTML(rightIdx);

        this.pageLeft.classList.remove('flip-forward');
        this.pageRight.classList.remove('flip-backward');

        this.onPageChange(leftIdx, rightIdx);
    }

    getPageHTML(index) {
        if (index >= 0 && index < this.totalPages) {
            return this.pages[index];
        }
        return '<div class="empty-page"></div>';
    }

    async next() {
        if (this.isAnimating) return;
        if (this.currentSpread + 2 >= this.totalPages) return;

        this.isAnimating = true;
        this.pageRight.classList.add('flip-forward');

        await this._wait(this.duration);

        this.currentSpread += 2;

        const leftIdx = this.currentSpread;
        const rightIdx = this.currentSpread + 1;

        this.pageLeft.innerHTML = this.getPageHTML(leftIdx);
        this.pageRight.innerHTML = this.getPageHTML(rightIdx);

        this.pageRight.classList.remove('flip-forward');

        this.isAnimating = false;
        this.onPageChange(leftIdx, rightIdx);
    }

    async prev() {
        if (this.isAnimating) return;
        if (this.currentSpread - 2 < 0) return;

        this.isAnimating = true;
        this.pageLeft.classList.add('flip-backward');

        await this._wait(this.duration);

        this.currentSpread -= 2;

        const leftIdx = this.currentSpread;
        const rightIdx = this.currentSpread + 1;

        this.pageLeft.innerHTML = this.getPageHTML(leftIdx);
        this.pageRight.innerHTML = this.getPageHTML(rightIdx);

        this.pageLeft.classList.remove('flip-backward');

        this.isAnimating = false;
        this.onPageChange(leftIdx, rightIdx);
    }

    async goTo(pageIndex) {
        if (this.isAnimating) return;
        if (pageIndex < 0 || pageIndex >= this.totalPages) return;

        let spread = pageIndex;
        if (spread % 2 !== 0) spread -= 1;
        if (spread < 0) spread = 0;

        if (spread === this.currentSpread) return;

        if (Math.abs(spread - this.currentSpread) > 2) {
            this.currentSpread = spread;
            this.render();
            return;
        }

        while (this.currentSpread < spread) {
            await this.next();
        }
        while (this.currentSpread > spread) {
            await this.prev();
        }
    }

    getCurrentInfo() {
        const left = this.currentSpread + 1;
        const right = Math.min(this.currentSpread + 2, this.totalPages);
        return {
            leftPage: left,
            rightPage: right,
            totalPages: this.totalPages,
            leftIndex: this.currentSpread,
            rightIndex: this.currentSpread + 1
        };
    }

    updateLayout() {
        const isMobile = window.innerWidth < 768;
        if (isMobile !== this.isSinglePage) {
            this.isSinglePage = isMobile;
            this.render();
        }
    }

    _wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    destroy() {
        this.pages = [];
        this.totalPages = 0;
        this.pageLeft.innerHTML = '';
        this.pageRight.innerHTML = '';
        this.isAnimating = false;
    }
}