# GMIT Kharisma Penfui — V2

Versi baru dibuat dari struktur proyek GMIT Kharisma sebelumnya, dengan tampilan dan bagian utama tetap dipertahankan.

## Fitur admin
- Login admin melalui backend.
- Warta Jemaat: tambah dan hapus.
- Segera Hadir: editor dan tombol Simpan.
- Agenda Minggu Ini: tambah, edit, hapus, dan simpan ke SQLite.
- Galeri: maksimal 6 foto, upload, hapus, dan tombol Simpan Foto.
- Video Aktivitas: upload dan hapus.
- Pesan berhasil/gagal tampil sebagai notifikasi di halaman.

## Jalankan lokal
1. Salin `.env.example` menjadi `.env`.
2. Isi `ADMIN_USERNAME`, `ADMIN_PASSWORD`, dan `SESSION_SECRET`.
3. Jalankan `npm install`.
4. Jalankan `npm start`.
5. Buka `http://localhost:3000`.

Jangan memasukkan `.env` atau database SQLite ke GitHub.
