# Diagnose UGREEN NAS SMB: clears stale creds, tests login, lists shares.
param(
  [string]$Password,
  [string]$User,
  [string]$Host = "",
  [string]$Share = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env"

function Read-DotEnvValue([string]$Key) {
  if (-not (Test-Path $envFile)) { return "" }
  foreach ($lineRaw in Get-Content $envFile) {
    $line = $lineRaw.Trim()
    if (-not $line -or $line.StartsWith("#")) { continue }
    $eq = $line.IndexOf("=")
    if ($eq -le 0) { continue }
    $name = $line.Substring(0, $eq).Trim()
    if ($name -ne $Key) { continue }
    $value = $line.Substring($eq + 1).Trim()
    if ($value.StartsWith('"') -and $value.EndsWith('"')) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    return $value
  }
  return ""
}

function Remove-NetUseQuiet([string]$RemotePath) {
  Remove-SmbMapping -RemotePath $RemotePath -Force -ErrorAction SilentlyContinue | Out-Null
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  try {
    & net.exe use $RemotePath /delete /y 2>&1 | Out-Null
  } finally {
    $ErrorActionPreference = $prev
  }
}

function Clear-AllNasCredentials([string]$NasHost, [string]$DeviceName) {
  foreach ($target in @($NasHost, $DeviceName, "TERMSRV/$NasHost")) {
    if (-not $target) { continue }
    cmdkey /delete:$target 2>$null | Out-Null
  }
  Remove-NetUseQuiet "\\$NasHost"
  Remove-NetUseQuiet "\\$NasHost\IPC$"
}

function Invoke-NetUse([string]$RemotePath, [string]$CandidateUser, [string]$Pass) {
  Remove-NetUseQuiet $RemotePath
  Remove-NetUseQuiet "\\$($RemotePath -replace '^\\\\([^\\]+).*','$1')"
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $output = & net.exe use $RemotePath $Pass "/user:$CandidateUser" "/persistent:no" 2>&1 | Out-String
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  return @{ Code = $code; Output = $output.Trim() }
}

$nasHost = if ($Host) { $Host } else { Read-DotEnvValue "DB_BACKUP_NAS_HOST" }
$nasShare = if ($Share) { $Share } else { Read-DotEnvValue "DB_BACKUP_NAS_SHARE" }
$nasUser = if ($User) { $User } else { Read-DotEnvValue "DB_BACKUP_NAS_USER" }
$device = Read-DotEnvValue "DB_BACKUP_NAS_DEVICE_NAME"
if (-not $device) { $device = "agc-nas" }
if (-not $nasHost) { $nasHost = "192.168.50.21" }
if (-not $nasShare) { $nasShare = "DB's updated" }
if (-not $nasUser) { $nasUser = "lau" }

if (-not $Password) {
  $securePass = Read-Host "NAS password for $nasUser" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePass)
  try {
    $Password = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

Write-Host "=== UGREEN NAS SMB diagnostic ==="
Write-Host "Host : $nasHost"
Write-Host "Share: $nasShare"
Write-Host "User : $nasUser"
Write-Host ""

$smb = Test-NetConnection $nasHost -Port 445 -WarningAction SilentlyContinue
if (-not $smb.TcpTestSucceeded) {
  Write-Host "FAIL: SMB port 445 not reachable on $nasHost"
  exit 1
}
Write-Host "OK: SMB port 445 reachable"

Write-Host "Clearing cached Windows credentials for $nasHost ..."
Clear-AllNasCredentials -NasHost $nasHost -DeviceName $device

$candidates = @(
  $nasUser,
  "$device\$nasUser",
  ".\$nasUser",
  "$nasHost\$nasUser"
) | Select-Object -Unique

$ipcPath = "\\$nasHost\IPC$"
$workingUser = $null
Write-Host ""
Write-Host "Step 1: Test login (IPC$ — no share folder needed)"
foreach ($candidate in $candidates) {
  $result = Invoke-NetUse -RemotePath $ipcPath -CandidateUser $candidate -Pass $Password
  if ($result.Code -eq 0 -or $result.Output -match 'already connected|command completed successfully') {
    Write-Host "  OK   $candidate"
    $workingUser = $candidate
    break
  }
  Write-Host "  FAIL $candidate"
  Write-Host "       $($result.Output)"
}

if (-not $workingUser) {
  Write-Host ""
  Write-Host "All login attempts failed. This is NOT a share-name problem."
  Write-Host ""
  Write-Host "Fix in UGOS (https://agc-nas.aar3.ug.link/desktop/):"
  Write-Host "  1. Control Panel -> File Services -> enable SMB"
  Write-Host "  2. User lau -> confirm password (reset if unsure)"
  Write-Host "  3. User lau must be a local NAS account with SMB access"
  Write-Host ""
  Write-Host "Then in Windows: Credential Manager -> remove any entry for $nasHost"
  exit 1
}

Write-Host ""
Write-Host "Step 2: List SMB shares on the NAS"
$prev = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$shares = & net.exe view "\\$nasHost" 2>&1 | Out-String
$ErrorActionPreference = $prev
Write-Host $shares

Write-Host "Step 3: Test configured share \\$nasHost\$nasShare"
$sharePath = "\\$nasHost\$nasShare"
$result = Invoke-NetUse -RemotePath $sharePath -CandidateUser $workingUser -Pass $Password
if ($result.Code -eq 0 -or $result.Output -match 'already connected|command completed successfully') {
  Write-Host "  OK   Share '$nasShare' is accessible"
  Write-Host ""
  Write-Host "Use in .env:"
  Write-Host "  DB_BACKUP_NAS_USER=`"$workingUser`""
  Write-Host "  DB_BACKUP_NAS_SHARE=`"$nasShare`""
  Write-Host ""
  Write-Host "Then run: npm run db:backup:setup-nas"
  Remove-NetUseQuiet $sharePath
  Remove-NetUseQuiet $ipcPath
  exit 0
}

Write-Host "  FAIL Share '$nasShare' not found or no permission"
Write-Host "       $($result.Output)"
Write-Host ""
Write-Host "Login works, but the share name is wrong."
Write-Host "In UGOS open File Manager -> right-click the folder -> Properties"
Write-Host "Use the exact SMB share name from Step 2 above (not always the display label)."
Remove-NetUseQuiet $ipcPath
exit 1
