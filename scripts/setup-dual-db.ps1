<#
.SYNOPSIS
    Setup script: Docker PostgreSQL + native MySQL on port 3306.
#>

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
Set-Location $ProjectRoot

Write-Host "=== Dual-Database Setup ===" -ForegroundColor Cyan
Write-Host "Project root: $ProjectRoot`n" -ForegroundColor Gray

# ── Pre-flight ────────────────────────────────────────────────────
Write-Host "[Pre-flight] Checking prerequisites..." -ForegroundColor Yellow

$nodeVersion = node --version
Write-Host "       Node:   $nodeVersion" -ForegroundColor Green

$npmVersion = npm --version
Write-Host "       npm:    $npmVersion" -ForegroundColor Green

if (-not (Test-Path (Join-Path $ProjectRoot "node_modules"))) {
    Write-Warning "node_modules not found. Running npm install..."
    npm install
    if ($LASTEXITCODE -ne 0) { Write-Error "npm install failed."; exit 1 }
}

# Check if Docker is available (optional — only needed for PostgreSQL)
$dockerAvailable = $true
docker --version 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Docker not found. You need PostgreSQL running locally (install from https://www.postgresql.org/download/windows/)"
    Write-Host "       Using your native MySQL on port 3306.`n" -ForegroundColor Yellow
    $dockerAvailable = $false
}
Write-Host "`n"

# ── Step 1: .env ──────────────────────────────────────────────────
$envFile = Join-Path $ProjectRoot ".env"
$envExample = Join-Path $ProjectRoot ".env.example"
if (-not (Test-Path $envFile)) {
    Write-Host "[1/5] Creating .env from .env.example..." -ForegroundColor Yellow
    Copy-Item $envExample $envFile
    Write-Host "       .env created. Review credentials if needed.`n" -ForegroundColor Green
} else {
    Write-Host "[1/5] .env already exists — skipping.`n" -ForegroundColor Green
}

# ── Step 2: Generate Prisma clients ───────────────────────────────
Write-Host "[2/5] Generating Prisma clients..." -ForegroundColor Yellow
npm run db:generate:all
if ($LASTEXITCODE -ne 0) { Write-Error "Prisma client generation failed."; exit 1 }
Write-Host "       Prisma clients generated.`n" -ForegroundColor Green

# ── Step 3: Start PostgreSQL (Docker) ─────────────────────────────
if ($dockerAvailable) {
    Write-Host "[3/5] Starting PostgreSQL via Docker..." -ForegroundColor Yellow
    npm run docker:up
    if ($LASTEXITCODE -ne 0) { Write-Error "Docker failed. Is Docker Desktop running?"; exit 1 }

    Write-Host "       Waiting for PostgreSQL..." -ForegroundColor Gray
    $maxRetries = 30
    $retryDelay = 2
    for ($i = 1; $i -le $maxRetries; $i++) {
        $pgContainer = docker compose ps -q postgres 2>$null
        if ($pgContainer) {
            $pgCheck = docker exec $pgContainer pg_isready -U tickets 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "       PostgreSQL ready after ~$(($i * $retryDelay))s" -ForegroundColor Green
                break
            }
        }
        if ($i -eq $maxRetries) { Write-Warning "Timed out waiting for PostgreSQL." }
        Start-Sleep -Seconds $retryDelay
    }
    Write-Host "`n"
} else {
    Write-Host "[3/5] PostgreSQL — make sure it's running locally on port 5432.`n" -ForegroundColor Yellow
}

# ── Step 4: Push schemas ──────────────────────────────────────────
Write-Host "[4/5] Pushing schemas to databases..." -ForegroundColor Yellow
Write-Host "       Pushing primary (PostgreSQL)..."
npm run db:push:primary
if ($LASTEXITCODE -ne 0) { Write-Error "Primary schema push failed."; exit 1 }

Write-Host "       Pushing secondary (MySQL)..."
npm run db:push:secondary
if ($LASTEXITCODE -ne 0) { Write-Error "Secondary schema push failed."; exit 1 }
Write-Host "       Schemas pushed.`n" -ForegroundColor Green

# ── Step 5: Seed & Verify ─────────────────────────────────────────
Write-Host "[5/5] Seeding databases..." -ForegroundColor Yellow
Write-Host "       Seeding primary (PostgreSQL)..."
npm run db:seed
if ($LASTEXITCODE -ne 0) { Write-Error "Primary seed failed."; exit 1 }

Write-Host "       Seeding secondary (MySQL)..."
npm run db:seed:secondary
if ($LASTEXITCODE -ne 0) { Write-Error "Secondary seed failed."; exit 1 }
Write-Host "       Both databases seeded.`n" -ForegroundColor Green

# ── Verify ────────────────────────────────────────────────────────
Write-Host "Verifying..." -ForegroundColor Yellow
npm run db:runcheck

Write-Host "`n=== Setup Complete! ===" -ForegroundColor Cyan
Write-Host "PostgreSQL: localhost:5432 (ticket_system_v3_DEV)" -ForegroundColor Green
Write-Host "MySQL:      localhost:3306 (mergeddatabase-dev)" -ForegroundColor Green
