# 📖 Papyrus Reader

**Papyrus Reader** adalah aplikasi pembaca buku digital berbasis web (PWA) yang ringan, cepat, dan mendukung berbagai format buku digital. Aplikasi ini berjalan sepenuhnya di sisi klien dan dapat di-host gratis di GitHub Pages.

## ✨ Fitur (Fase 1 - Foundation)

- ✅ **Perpustakaan Digital** - Kelola koleksi buku dengan tampilan grid
- ✅ **Upload File** - Drag & drop atau klik tombol +
- ✅ **Multi-Format** - Support EPUB, PDF, TXT, Markdown
- ✅ **Tema** - Light, Dark, Sepia (otomatis sesuai preferensi sistem)
- ✅ **Penyimpanan Lokal** - IndexedDB untuk menyimpan buku & progress
- ✅ **Responsif** - Tampilan optimal di desktop, tablet, dan mobile
- ✅ **PWA Ready** - Installable, offline support

## 🚀 Deployment ke GitHub Pages

1. Fork atau clone repository ini
2. Upload semua file ke repository GitHub
3. Aktifkan GitHub Pages:
   - Settings → Pages
   - Source: `main` branch, root folder
4. Akses via: `https://[username].github.io/[repository-name]`

## 🎯 Roadmap

| Fase | Fitur | Status |
|------|-------|--------|
| 1 | Foundation (Database, Theme, Library, Upload) | ✅ Selesai |
| 2 | Reader Engine (EPUB, PDF, TXT, MD) | 🔜 |
| 3 | Reading Features (Bookmark, Highlight, Search) | 🔜 |
| 4 | PWA (Service Worker, Offline) | 🔜 |
| 5 | Analytics (Stats, Streak, Goals) | 🔜 |

## 🛠️ Teknologi

- HTML5 + CSS3 (CSS Variables)
- Vanilla JavaScript (ES2020+)
- Dexie.js (IndexedDB wrapper)
- Web Storage API

## 📄 Lisensi

MIT License