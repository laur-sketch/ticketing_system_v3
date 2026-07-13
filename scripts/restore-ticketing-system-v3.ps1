# Restores a PostgreSQL dump into an existing database (or recreates the DB if asked).
# Reads DATABASE_URL from (in order): .env.restore, then .env (app folder).
# Detects dump format automatically:
#   - PGDMP header  => pg_restore (pgAdmin "Custom" backup, even if extension is .sql)
#   - plain text    => psql -f
# Prerequisites: PostgreSQL client tools (pg_restore/psql), ideally same major as dump (18).
# Optional: set PG_BIN to your bin folder, e.g. C:\Program Files\PostgreSQL\18\bin
#
# Examples:
#   # Full restore into empty DB (or use -RecreateDatabase for a clean slate)
#   .\scripts\restore-ticketing-system-v3.ps1 -DumpPath "C:\path\ticket_system_v3.sql"
#
#   # Merge data into current DB (keeps database; replaces row data in public tables)
#   .\scripts\restore-ticketing-system-v3.ps1 -DumpPath "C:\path\ticket_system_v3.sql" -MergeDataOnly -TruncatePublicTablesBeforeImport

param(
  [string]$DumpPath = "C:\Users\jlsms\OneDrive\Desktop\work\ticket_system_v3.sql",
  [string]$TargetDatabase = "",
  [switch]$RecreateDatabase,
  [switch]$MergeDataOnly,
  [switch]$TruncatePublicTablesBeforeImport
)

$ErrorActionPreference = "Stop"

function Get-DumpFormat {
  param([string]$Path)
  $bytes = Get-Content -Path $Path -Encoding Byte -TotalCount 5
  if ($bytes.Count -ge 5 -and [System.Text.Encoding]::ASCII.GetString($bytes) -eq "PGDMP") {
    return "custom"
  }
  return "plain"
}

function Quote-DbIdentifier {
  param([string]$Name)
  return '"' + ($Name -replace '"', '""') + '"'
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
if (-not $TargetDatabase) {
  $dbPath = $u.AbsolutePath.Trim('/')
  if (-not $dbPath) {
    Write-Error "DATABASE_URL must include a database name in the path."
  }
  $TargetDatabase = [Uri]::UnescapeDataString($dbPath)
}

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

$dumpFormat = Get-DumpFormat -Path $DumpPath
Write-Host ("Dump format detected: {0}" -f $dumpFormat)
if ($dumpFormat -eq "plain" -and $MergeDataOnly) {
  Write-Warning "MergeDataOnly is intended for custom-format dumps. Plain SQL may still fail on duplicate keys."
}

$quotedDb = Quote-DbIdentifier $TargetDatabase
$env:PGPASSWORD = $dbPass
try {
  Write-Host ("Target database '{0}' (user={1} host={2} port={3})..." -f $TargetDatabase, $dbUser, $dbHost, $dbPort)

  if ($RecreateDatabase) {
    if ($MergeDataOnly) {
      Write-Error "Use either -RecreateDatabase or -MergeDataOnly, not both."
    }
    Write-Host ("RecreateDatabase: dropping {0} if it exists (terminates connections)..." -f $quotedDb)
    $dropOut = & $psql -h $dbHost -p $dbPort -U $dbUser -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $quotedDb WITH (FORCE);" 2>&1
    if ($LASTEXITCODE -ne 0) { throw "DROP DATABASE failed (need superuser): $dropOut" }
    $out = & $psql -h $dbHost -p $dbPort -U $dbUser -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $quotedDb ENCODING 'UTF8';" 2>&1
    if ($LASTEXITCODE -ne 0) { throw "CREATE DATABASE failed: $out" }
    Write-Host ("Created fresh database {0}." -f $quotedDb)
  } else {
    $checkSql = "SELECT 1 FROM pg_database WHERE datname = '$($TargetDatabase -replace "'", "''")';"
    $exists = & $psql -h $dbHost -p $dbPort -U $dbUser -d postgres -tAc $checkSql 2>&1
    if ($LASTEXITCODE -ne 0) { throw "psql failed: $exists" }
    if ($exists -match "^\s*1\s*$") {
      Write-Host ("Database {0} already exists - keeping it." -f $quotedDb)
    } else {
      $out = & $psql -h $dbHost -p $dbPort -U $dbUser -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $quotedDb ENCODING 'UTF8';" 2>&1
      if ($LASTEXITCODE -ne 0) { throw "CREATE DATABASE failed (need superuser or CREATEDB): $out" }
      Write-Host ("Created database {0}." -f $quotedDb)
    }
  }

  if ($TruncatePublicTablesBeforeImport) {
    if (-not $MergeDataOnly) {
      Write-Error "-TruncatePublicTablesBeforeImport requires -MergeDataOnly."
    }
    Write-Host "Truncating all public tables (CASCADE) before data import..."
    $truncateFile = Join-Path $PSScriptRoot "truncate-public-tables.sql"
    $truncateOut = & $psql -h $dbHost -p $dbPort -U $dbUser -d $TargetDatabase -v ON_ERROR_STOP=1 -f $truncateFile 2>&1
    if ($LASTEXITCODE -ne 0) { throw "TRUNCATE failed: $truncateOut" }
  }

  if ($dumpFormat -eq "custom") {
    $restoreArgs = @(
      "-h", $dbHost,
      "-p", $dbPort,
      "-U", $dbUser,
      "-d", $TargetDatabase,
      "--no-owner",
      "--no-acl",
      "--verbose"
    )
    if ($MergeDataOnly) {
      $restoreArgs += @("--data-only", "--disable-triggers")
      Write-Host "Running pg_restore (data only into existing tables)..."
    } else {
      Write-Host "Running pg_restore (schema + data)..."
      Write-Host "If tables already exist, use -MergeDataOnly -TruncatePublicTablesBeforeImport or -RecreateDatabase."
    }
    & $pg_restore @restoreArgs $DumpPath
    if ($LASTEXITCODE -ne 0) {
      if ($MergeDataOnly) {
        Write-Warning "pg_restore finished with errors (often duplicate keys if -TruncatePublicTablesBeforeImport was not used)."
      } else {
        throw "pg_restore exited with code $LASTEXITCODE"
      }
    }
  } else {
    Write-Host "Running psql for plain SQL dump..."
  if ($MergeDataOnly) {
      Write-Warning "Plain SQL full dumps usually include CREATE TABLE and fail on existing databases. Prefer re-exporting as Custom format, or restore to an empty DB."
    }
    & $psql -h $dbHost -p $dbPort -U $dbUser -d $TargetDatabase -v ON_ERROR_STOP=1 -f $DumpPath
    if ($LASTEXITCODE -ne 0) { throw "psql exited with code $LASTEXITCODE" }
  }

  Write-Host "Done."
  Write-Host "DATABASE_URL:"
  Write-Host "  postgresql://${dbUser}:***@${dbHost}:${dbPort}/${TargetDatabase}?schema=public"
}
finally {
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}
