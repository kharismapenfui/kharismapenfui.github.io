GMIT KHARISMA - FIX FINAL VERCEL

Masalah yang ditemukan:
- File perbaikan berada di folder gmit-vercel-fix, bukan di ROOT project.
- package.json ROOT masih memakai sqlite3/connect-sqlite3/express-session.
- Vercel sudah Ready, tetapi ROOT belum menggunakan paket backend Supabase yang sudah diperbaiki.

Cara menjalankan:
1. Letakkan file SELESAIKAN-GMIT-VERCEL.ps1 dan JALANKAN-FIX-FINAL.cmd di folder mana saja.
2. Pastikan project tetap di D:\CODING\gereja\kharismanew.
3. Double-click JALANKAN-FIX-FINAL.cmd.
4. Tunggu sampai selesai. Script akan memindahkan server/package yang benar ke ROOT, membuat package-lock baru, mengecek syntax, commit, dan push ke GitHub.
5. Setelah selesai, Vercel otomatis membuat deployment baru.

Jangan kirim password, SESSION_SECRET, atau Supabase secret key ke chat.
