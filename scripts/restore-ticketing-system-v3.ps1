# Restores a PostgreSQL CUSTOM-format dump into database ticketing_system_v3.
# Reads DATABASE_URL from (in order): .env.restore, then .env (app folder).
# Prerequisites: PostgreSQL client tools (pg_restore/psql), ideally same major as the dump (18).
# Optional: set PG_BIN to your bin folder, e.g. C:\Program Files\PostgreSQL\18\bin
# Use -RecreateDatabase to DROP (WITH FORCE) + CREATE an empty DB first (avoids "already exists" on re-restore).

param(
  [string]$DumpPath = "c:\Users\tk\Desktop\work\ticket_system_v3.sql",
  [string]$TargetDatabase = "ticketing_system_v3",
  [switch]$RecreateDatabase
)

$ErrorActionPreference = "Stop"

if ($TargetDatabase -notmatch '^[a-zA-Z_][a-zA-Z0-9_]*$') {
  Write-Error "TargetDatabase must be a simple SQL identifier."
}

$AppRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$restoreFile = Join-Path $AppRoot ".env.restore"
$envFile = Join-Path $AppRoot ".env"
$sourceFile = $null
if (Test-Path $restoreFile) {
  $sourceFile = $restoreFile
  Write-Host "Using credentials from .env.restore"
} elseif (Test-Path $envFile) {
  $sourceFile = $envFile
  Write-Host "Using credentials from .env"
} else {
  Write-Error "Missing .env and .env.restore. Copy .env.restore.example to .env.restore and set DATABASE_URL, or fix .env."
}

$raw = Get-Content $sourceFile -Raw
if ($raw -notmatch "DATABASE_URL\s*=\s*`"([^`"]+)`"") {
  Write-Error "Could not find DATABASE_URL in $sourceFile"
}
$databaseUrl = $Matches[1]

$httpUrl = $databaseUrl -replace '^postgresql://', 'http://' -replace '^postgres://', 'http://'
try {
  $u = [Uri]::new($httpUrl, [UriKind]::AbsoluteUri)
} catch {
  Write-Error "DATABASE_URL is not a valid URL: $_"
}
if (-not $u.UserInfo) {
  Write-Error "DATABASE_URL must include user:password@host"
}
$colon = $u.UserInfo.IndexOf(':')
if ($colon -lt 1) {
  Write-Error "DATABASE_URL must include a password after the username"
}
$dbUser = $u.UserInfo.Substring(0, $colon)
$dbPass = [Uri]::UnescapeDataString($u.UserInfo.Substring($colon + 1))
$dbHost = $u.Host
if ($dbHost -eq 'localhost') {
  $dbHost = '127.0.0.1'
}
$dbPort = if ($u.Port -gt 0) { $u.Port.ToString() } else { '5432' }

$pgBin = $env:PG_BIN
if (-not $pgBin) {
  $cand = @(
    "C:\Program Files\PostgreSQL\18\bin",
    "C:\Program Files\PostgreSQL\17\bin",
    "C:\Program Files\PostgreSQL\16\bin"
  ) | Where-Object { Test-Path (Join-Path $_ "pg_restore.exe") } | Select-Object -First 1
  if ($cand) { $pgBin = $cand }
}
if (-not $pgBin -or -not (Test-Path (Join-Path $pgBin "pg_restore.exe"))) {
  Write-Error "pg_restore.exe not found. Install PostgreSQL client tools or set env PG_BIN to the ...\PostgreSQL\18\bin folder."
}

$psql = Join-Path $pgBin "psql.exe"
$pg_restore = Join-Path $pgBin "pg_restore.exe"
if (-not (Test-Path $DumpPath)) {
  Write-Error "Dump file not found: $DumpPath"
}

$env:PGPASSWORD = $dbPass
try {
  Write-Host ("Checking database '{0}' (user={1} host={2} port={3})..." -f $TargetDatabase, $dbUser, $dbHost, $dbPort)

  if ($RecreateDatabase) {
    Write-Host ("RecreateDatabase: dropping '{0}' if it exists (terminates connections)..." -f $TargetDatabase)
    $dropOut = & $psql -h $dbHost -p $dbPort -U $dbUser -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS `"$TargetDatabase`" WITH (FORCE);" 2>&1
    if ($LASTEXITCODE -ne 0) { throw "DROP DATABASE failed (need superuser): $dropOut" }
    $out = & $psql -h $dbHost -p $dbPort -U $dbUser -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE `"$TargetDatabase`" ENCODING 'UTF8';" 2>&1
    if ($LASTEXITCODE -ne 0) { throw "CREATE DATABASE failed: $out" }
    Write-Host ("Created fresh database '{0}'." -f $TargetDatabase)
  } else {
    $checkSql = "SELECT 1 FROM pg_database WHERE datname = '$TargetDatabase';"
    $exists = & $psql -h $dbHost -p $dbPort -U $dbUser -d postgres -tAc $checkSql 2>&1
    if ($LASTEXITCODE -ne 0) { throw "psql failed: $exists" }
    if ($exists -match "^\s*1\s*$") {
      Write-Host ("Database '{0}' already exists (use -RecreateDatabase to drop and reload)." -f $TargetDatabase)
    } else {
      $out = & $psql -h $dbHost -p $dbPort -U $dbUser -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE `"$TargetDatabase`" ENCODING 'UTF8';" 2>&1
      if ($LASTEXITCODE -ne 0) { throw "CREATE DATABASE failed (need superuser or CREATEDB): $out" }
      Write-Host ("Created database '{0}'." -f $TargetDatabase)
    }
  }

  Write-Host "Running pg_restore (this may take a minute)..."
  & $pg_restore -h $dbHost -p $dbPort -U $dbUser -d $TargetDatabase --no-owner --no-acl --verbose $DumpPath
  if ($LASTEXITCODE -ne 0) { throw "pg_restore exited with code $LASTEXITCODE" }
  Write-Host "Done. Point DATABASE_URL at this database, e.g.:"
  Write-Host "  postgresql://${dbUser}:***@${dbHost}:${dbPort}/${TargetDatabase}?schema=public"
}
finally {
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}
