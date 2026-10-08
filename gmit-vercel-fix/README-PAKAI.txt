PERBAIKAN DEPLOY VERCEL - GMIT KHARISMA

File di folder ini menggantikan file yang sama di folder proyek website.

1. Salin server.js, package.json, dan vercel.json ke folder proyek:
   D:\CODING\gereja\kharismanew
   Pilih Replace/Ganti.

2. HAPUS package-lock.json lama dari folder proyek.
   Ini penting karena package-lock lama masih berisi dependency SQLite yang sudah tidak dipakai.

3. JANGAN HAPUS file website lain (index.html, script.js, style.css, data, img, dll).

4. Setelah itu commit/push perubahan ke GitHub. Vercel akan membaca commit terbaru dan membuat dependency baru dari package.json.

5. Environment Variables Vercel tetap harus berisi:
   ADMIN_USERNAME
   ADMIN_PASSWORD
   SESSION_SECRET (minimal 32 karakter)
   SUPABASE_URL
   SUPABASE_SECRET_KEY

JANGAN masukkan nilai secret ke GitHub.
