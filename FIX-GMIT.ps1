$ErrorActionPreference = "Stop"

$Target = "D:\CODING\gereja\kharismanew"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host " GMIT KHARISMA - PERBAIKAN FINAL" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $Target)) {
    throw "Folder project tidak ditemukan: $Target"
}

Write-Host "[1/8] Menyalin server.js dan package.json..."
Copy-Item (Join-Path $Here "server.js") (Join-Path $Target "server.js") -Force
Copy-Item (Join-Path $Here "package.json") (Join-Path $Target "package.json") -Force

Write-Host "[2/8] Menghapus vercel.json lama jika ada..."
$vercel = Join-Path $Target "vercel.json"
if (Test-Path $vercel) { Remove-Item $vercel -Force }

Write-Host "[3/8] Memeriksa package.json..."
Push-Location $Target
try {
    node -e "const p=require('./package.json'); const bad=['sqlite3','connect-sqlite3','express-session']; if(bad.some(x=>p.dependencies&&p.dependencies[x])) process.exit(2); console.log('package.json OK - tanpa SQLite');"
    if ($LASTEXITCODE -ne 0) { throw "package.json masih mengandung dependency SQLite/session lama." }

    Write-Host "[4/8] Membuat package-lock.json baru..."
    npm install --package-lock-only --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw "npm gagal membuat package-lock.json." }

    Write-Host "[5/8] Memeriksa syntax server.js..."
    node --check server.js
    if ($LASTEXITCODE -ne 0) { throw "Syntax server.js bermasalah." }

    Write-Host "[6/8] Memeriksa Git..."
    git rev-parse --is-inside-work-tree | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Folder ini bukan repository Git." }

    Write-Host "[7/8] Commit perubahan..."
    git add -A
    git diff --cached --quiet
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Tidak ada perubahan baru untuk di-commit."
    } else {
        git commit -m "Fix Vercel Supabase deployment"
        if ($LASTEXITCODE -ne 0) { throw "git commit gagal." }
    }

    Write-Host "[8/8] Push ke GitHub..."
    git push origin main
    if ($LASTEXITCODE -ne 0) { throw "git push gagal." }

    Write-Host ""
    Write-Host "===============================================" -ForegroundColor Green
    Write-Host " BERHASIL - PERBAIKAN SUDAH DIKIRIM KE GITHUB" -ForegroundColor Green
    Write-Host " Vercel seharusnya mulai deploy otomatis." -ForegroundColor Green
    Write-Host "===============================================" -ForegroundColor Green
}
finally {
    Pop-Location
}
