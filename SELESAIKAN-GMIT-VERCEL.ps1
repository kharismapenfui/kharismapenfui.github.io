$ErrorActionPreference = 'Stop'

$project = 'D:\CODING\gereja\kharismanew'
Set-Location $project

Write-Host '=== 1. Memindahkan file perbaikan ke ROOT project ===' -ForegroundColor Cyan
if (!(Test-Path '.\gmit-vercel-fix\server.js')) { throw 'Folder gmit-vercel-fix/server.js tidak ditemukan.' }
if (!(Test-Path '.\gmit-vercel-fix\package.json')) { throw 'Folder gmit-vercel-fix/package.json tidak ditemukan.' }

Copy-Item '.\gmit-vercel-fix\server.js' '.\server.js' -Force
Copy-Item '.\gmit-vercel-fix\package.json' '.\package.json' -Force

Write-Host '=== 2. Menghapus konfigurasi Vercel lama jika masih ada ===' -ForegroundColor Cyan
if (Test-Path '.\vercel.json') { Remove-Item '.\vercel.json' -Force }

Write-Host '=== 3. Membuat package-lock.json baru TANPA SQLite ===' -ForegroundColor Cyan
npm install --package-lock-only --ignore-scripts

Write-Host '=== 4. Memastikan tidak ada dependency SQLite lama ===' -ForegroundColor Cyan
$pkg = Get-Content '.\package.json' -Raw
if ($pkg -match 'sqlite|express-session|connect-sqlite3') {
  throw 'Dependency SQLite/session lama masih ada di package.json.'
}

Write-Host '=== 5. Mengecek syntax server.js ===' -ForegroundColor Cyan
node --check '.\server.js'

Write-Host '=== 6. Menghapus folder perbaikan yang sudah dipromosikan ke ROOT ===' -ForegroundColor Cyan
if (Test-Path '.\gmit-vercel-fix') { Remove-Item '.\gmit-vercel-fix' -Recurse -Force }

Write-Host '=== 7. Git status ===' -ForegroundColor Cyan
git status --short

Write-Host '=== 8. Commit dan push ke GitHub ===' -ForegroundColor Cyan
git add -A
git commit -m 'Finalize Vercel Express Supabase deployment'
git push origin main

Write-Host ''
Write-Host '=== SELESAI: PERBAIKAN SUDAH DIKIRIM KE GITHUB ===' -ForegroundColor Green
Write-Host 'Vercel akan otomatis membuat deployment baru.' -ForegroundColor Green
Write-Host 'JANGAN menjalankan git add/commit/push lagi setelah ini.' -ForegroundColor Yellow
