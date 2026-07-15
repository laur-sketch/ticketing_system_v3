# Adds a persistent Windows route so this server can reach the UGREEN NAS (10.10.5.0/24).
# MUST run as Administrator (elevated PowerShell).
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/add-nas-route.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/add-nas-route.ps1 -Remove

param(
  [string]$NasNetwork = "10.10.5.0",
  [string]$NasMask = "255.255.255.0",
  [string]$Gateway = "192.168.50.1",
  [switch]$Remove
)

$ErrorActionPreference = "Stop"

function Test-IsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdmin)) {
  Write-Host "Re-launching as Administrator..."
  $args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $PSCommandPath)
  if ($Remove) { $args += "-Remove" }
  Start-Process powershell.exe -Verb RunAs -ArgumentList $args
  exit 0
}

if ($Remove) {
  route delete $NasNetwork mask $NasMask $Gateway 2>$null | Out-Null
  Write-Host "Removed route to $NasNetwork via $Gateway (if it existed)."
  exit 0
}

Write-Host "=== NAS network route setup ==="
Write-Host "Server : $env:COMPUTERNAME"
Write-Host "Target : $NasNetwork/$NasMask (UGREEN NAS at 10.10.5.120)"
Write-Host "Gateway: $Gateway"
Write-Host ""

route -p add $NasNetwork mask $NasMask $Gateway metric 1
Write-Host ""
Write-Host "Persistent route added."
Write-Host ""

Write-Host "Testing reachability..."
$ping = Test-Connection -ComputerName "10.10.5.120" -Count 2 -Quiet -ErrorAction SilentlyContinue
$smb = Test-NetConnection -ComputerName "10.10.5.120" -Port 445 -WarningAction SilentlyContinue

if ($ping) {
  Write-Host "OK  Ping to 10.10.5.120"
} else {
  Write-Host "FAIL Ping to 10.10.5.120 (ICMP may be blocked - check SMB port)"
}

if ($smb.TcpTestSucceeded) {
  Write-Host "OK  SMB port 445 on 10.10.5.120"
  Write-Host ""
  Write-Host "Next: npm run db:backup:setup-nas"
  Write-Host "  NAS IP: 10.10.5.120"
  Write-Host "  SMB name: AGC-NAS"
  Write-Host "  User: AGC-NAS\lau"
} else {
  Write-Host "FAIL SMB port 445 on 10.10.5.120"
  Write-Host ""
  Write-Host "Route is set, but traffic still cannot reach the NAS."
  Write-Host "Your network admin must allow this server to reach 10.10.5.120:"
  Write-Host "  - Source: 192.168.50.219 (this server on Ethernet 2)"
  Write-Host "  - Destination: 10.10.5.120"
  Write-Host "  - Port: TCP 445 (SMB)"
  Write-Host "  - Router 192.168.254.254 must route 10.10.5.0/24"
}
