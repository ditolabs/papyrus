/* ========================================
   Reader Settings Feature
   ======================================== */

class SettingsFeature {
    constructor(options) {
        this.panel = options.panel;
        this.getSettings = options.getSettings || (() => ({}));
        this.saveSettings = options.saveSettings || (() => {});
        this.applySettings = options.applySettings || (() => {});
        this.showToast = options.showToast || (() => {});
        this.themeToggle = options.themeToggle || (() => {});

        this.settings = this.getSettings();
        this._bindEvents();
        this._loadUI();
    }

    _loadUI() {
        const s = this.settings;
        document.getElementById('fontSizeDisplay').textContent = s.fontSize || 16;
        document.getElementById('lhDisplay').textContent = s.lineHeight || 1.7;
        document.getElementById('marginDisplay').textContent = s.margin || 36;
        document.getElementById('fontFamilySelect').value = s.fontFamily || 'Georgia, serif';
        
        // Alignment
        document.querySelectorAll('.align-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.align === (s.alignment || 'justify'));
        });
    }

    _bindEvents() {
        // Font size
        document.getElementById('fontDec').addEventListener('click', () => this._adjust('fontSize', -1, 10, 28));
        document.getElementById('fontInc').addEventListener('click', () => this._adjust('fontSize', 1, 10, 28));

        // Line height
        document.getElementById('lhDec').addEventListener('click', () => this._adjust('lineHeight', -0.1, 1.2, 2.5));
        document.getElementById('lhInc').addEventListener('click', () => this._adjust('lineHeight', 0.1, 1.2, 2.5));

        // Margin
        document.getElementById('marginDec').addEventListener('click', () => this._adjust('margin', -4, 10, 80));
        document.getElementById('marginInc').addEventListener('click', () => this._adjust('margin', 4, 10, 80));

        // Font Family
        document.getElementById('fontFamilySelect').addEventListener('change', (e) => {
            this._set('fontFamily', e.target.value);
        });

        // Alignment
        document.querySelectorAll('.align-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.align-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._set('alignment', btn.dataset.align);
            });
        });

        // Theme buttons di settings
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (this.themeToggle) {
                    this.themeToggle(btn.dataset.theme);
                }
                document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Reset
        document.getElementById('resetSettings').addEventListener('click', () => {
            if (confirm('Reset semua pengaturan ke default?')) {
                const defaults = {
                    fontSize: 16,
                    fontFamily: 'Georgia, serif',
                    lineHeight: 1.7,
                    margin: 36,
                    alignment: 'justify'
                };
                this.settings = defaults;
                this.saveSettings(defaults);
                this._loadUI();
                this.applySettings(defaults);
                this.showToast('Pengaturan direset ke default', 'success');
            }
        });

        // Close
        document.getElementById('settingsClose').addEventListener('click', () => this.closePanel());

        // Tombol settings di toolbar
        document.getElementById('readerSettings').addEventListener('click', () => this.openPanel());
    }

    _adjust(key, delta, min, max) {
        const current = this.settings[key] || 0;
        let newVal = current + delta;
        if (key === 'lineHeight') {
            newVal = Math.round(newVal * 10) / 10;
        } else {
            newVal = Math.round(newVal);
        }
        newVal = Math.max(min, Math.min(max, newVal));
        this._set(key, newVal);
    }

    _set(key, value) {
        this.settings = { ...this.settings, [key]: value };
        this.saveSettings(this.settings);
        this._loadUI();
        this.applySettings(this.settings);
    }

    openPanel() {
        this.panel.classList.add('open');
        document.getElementById('panelOverlay').classList.add('active');
        this._loadUI();
    }

    closePanel() {
        this.panel.classList.remove('open');
        document.getElementById('panelOverlay').classList.remove('active');
    }
}