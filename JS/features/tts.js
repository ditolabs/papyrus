/* ========================================
   Text-to-Speech Feature
   ======================================== */

class TTSFeature {
    constructor(options) {
        this.getCurrentPageText = options.getCurrentPageText || (() => '');
        this.showToast = options.showToast || (() => {});
        this.getSettings = options.getSettings || (() => ({}));

        this.isPlaying = false;
        this.synth = window.speechSynthesis;
        this.utterance = null;
        this._bindEvents();
    }

    speak() {
        if (!this.synth) {
            this.showToast('Browser tidak mendukung Text-to-Speech', 'error');
            return;
        }

        if (this.isPlaying) {
            this.stop();
            return;
        }

        const text = this.getCurrentPageText();
        if (!text || text.trim().length < 10) {
            this.showToast('Teks di halaman ini terlalu pendek untuk dibacakan', 'info');
            return;
        }

        // Bersihkan teks dari HTML
        const cleanText = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (cleanText.length < 10) {
            this.showToast('Teks di halaman ini terlalu pendek', 'info');
            return;
        }

        // Hentikan jika ada suara lain
        if (this.synth.speaking) {
            this.synth.cancel();
        }

        this.utterance = new SpeechSynthesisUtterance(cleanText);
        this.utterance.lang = 'id-ID';
        this.utterance.rate = 0.9;
        this.utterance.pitch = 1.0;

        // Load voice preference
        const settings = this.getSettings();
        if (settings.ttsRate) {
            this.utterance.rate = settings.ttsRate;
        }

        this.utterance.onstart = () => {
            this.isPlaying = true;
            this._updateButton(true);
            this.showToast('🔊 Membacakan...', 'info');
        };

        this.utterance.onend = () => {
            this.isPlaying = false;
            this._updateButton(false);
            this.showToast('✅ Selesai dibacakan', 'success');
        };

        this.utterance.onerror = (e) => {
            console.warn('TTS Error:', e);
            this.isPlaying = false;
            this._updateButton(false);
            this.showToast('Gagal membacakan teks', 'error');
        };

        this.synth.speak(this.utterance);
    }

    stop() {
        if (this.synth) {
            this.synth.cancel();
        }
        this.isPlaying = false;
        this._updateButton(false);
        this.showToast('⏹️ Berhenti membacakan', 'info');
    }

    _updateButton(playing) {
        const btn = document.getElementById('readerTts');
        if (btn) {
            btn.textContent = playing ? '⏹️' : '🔊';
            btn.title = playing ? 'Berhenti membacakan' : 'Bacakan halaman ini';
        }
    }

    _bindEvents() {
        const btn = document.getElementById('readerTts');
        if (btn) {
            btn.addEventListener('click', () => this.speak());
        }
    }
}