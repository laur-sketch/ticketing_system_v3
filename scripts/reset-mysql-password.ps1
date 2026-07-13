<#
.SYNOPSIS
    Resets MySQL root password to 'root' using skip-grant-tables mode.
    Run this PowerShell as Administrator.
#>

$ErrorActionPreference = "Stop"
$mysqlBase = "C:\Program Files\MySQL\MySQL Server 8.0"
$mysqlBin = "$mysqlBase\bin"

Write-Host "=== MySQL Root Password Reset ===" -ForegroundColor Cyan

# 1. Find and stop MySQL service/process
$service = Get-Service -Name "MySQL*" -ErrorAction SilentlyContinue
if ($service) {
    Write-Host "Stopping MySQL service: $($service.Name)..." -ForegroundColor Yellow
    net stop $service.Name
} else {
    Write-Host "No MySQL service found. Stopping any running mysqld..." -ForegroundColor Yellow
}
taskkill /f /im mysqld.exe 2>$null
Start-Sleep -Seconds 3

# 2. Start MySQL with skip-grant-tables (background, no console mode)
Write-Host "Starting MySQL in safe mode..." -ForegroundColor Yellow
Start-Process -FilePath "$mysqlBin\mysqld" `
    -ArgumentList "--skip-grant-tables" `
    -WindowStyle Hidden

# 3. Wait for MySQL to be ready (polling with retries)
Write-Host "Waiting for MySQL safe mode to start..." -ForegroundColor Yellow
$ready = $false
for ($i = 1; $i -le 15; $i++) {
    Start-Sleep -Seconds 2
    $ping = & "$mysqlBin\mysqladmin" ping -u root --silent 2>$null
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        Write-Host "       MySQL safe mode ready after ~$(($i * 2))s" -ForegroundColor Green
        break
    }
}
if (-not $ready) {
    Write-Error "MySQL failed to start in safe mode. Check the MySQL error log for details."
    exit 1
}

# 4. Reset the root password (with mysql_native_password for Prisma compatibility)
Write-Host "Resetting root password to 'root'..." -ForegroundColor Yellow
$sqlFile = "$env:TEMP\reset-mysql.sql"
@"
FLUSH PRIVILEGES;
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'root';
FLUSH PRIVILEGES;
"@ | Out-File -FilePath $sqlFile -Encoding ascii

Get-Content $sqlFile | & "$mysqlBin\mysql" -u root
if ($LASTEXITCODE -eq 0) {
    Write-Host "       Password reset to 'root'!" -ForegroundColor Green
} else {
    Write-Error "Failed to reset password. Try running manually:"
    Write-Host "  ""$mysqlBin\mysql"" -u root" -ForegroundColor Yellow
    Write-Host "  ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'root';"
    exit 1
}

# 5. Shutdown safe-mode MySQL
Write-Host "Shutting down safe-mode MySQL..." -ForegroundColor Yellow
& "$mysqlBin\mysqladmin" -u root shutdown 2>$null
Start-Sleep -Seconds 3
taskkill /f /im mysqld.exe 2>$null
Start-Sleep -Seconds 2

# 6. Restart MySQL normally
if ($service) {
    Write-Host "Restarting MySQL service: $($service.Name)..." -ForegroundColor Yellow
    net start $service.Name
} else {
    Write-Host "Starting MySQL as a service..." -ForegroundColor Yellow
    # Install/start mysqld as a Windows service
    & "$mysqlBin\mysqld" --install MySQL80 2>$null
    net start MySQL80 2>$null
}
Start-Sleep -Seconds 3

# Verify connection
Write-Host "Verifying connection..." -ForegroundColor Yellow
& "$mysqlBin\mysql" -u root -proot -e "SELECT 'MySQL is ready!' AS status;"
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n=== MySQL password reset complete! ===" -ForegroundColor Green
    Write-Host "Now run these commands from your project folder:" -ForegroundColor Cyan
    Write-Host "  npm run db:push:secondary" -ForegroundColor Gray
    Write-Host "  npm run db:seed:secondary" -ForegroundColor Gray
} else {
    Write-Warning "MySQL started but connection failed. Check the service manually."
}
