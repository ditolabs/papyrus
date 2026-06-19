/* ========================================
   Base Engine - Abstract class
   ======================================== */

class BaseEngine {
    constructor(file) {
        this.file = file;
        this.metadata = { title: '', author: '', cover: null };
        this.toc = [];
        this.totalPages = 0;
        this.loaded = false;
    }

    async load() {
        throw new Error('Method load() harus diimplementasikan');
    }

    async getPage(pageNum) {
        throw new Error('Method getPage() harus diimplementasikan');
    }

    getTotalPages() {
        return this.totalPages;
    }

    getMetadata() {
        return this.metadata;
    }

    getTOC() {
        return this.toc;
    }

    isLoaded() {
        return this.loaded;
    }
}