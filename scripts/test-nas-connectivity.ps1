# Quick NAS connectivity check after route + IT firewall changes.
$ErrorActionPreference = "SilentlyContinue"

Write-Host "=== NAS connectivity check ==="
Write-Host "Server: $env:COMPUTERNAME"
Write-Host ""

$route = route print | Select-String "10.10.5"
if ($route) {
  Write-Host "OK  Route to 10.10.5.0/24 configured"
  Write-Host "    $route"
} else {
  Write-Host "FAIL No route to 10.10.5.0/24 - run: npm run db:backup:add-nas-route (as Admin)"
}

Write-Host ""
$smb = Test-NetConnection -ComputerName "10.10.5.120" -Port 445 -WarningAction SilentlyContinue
if ($smb.TcpTestSucceeded) {
  Write-Host "OK  SMB port 445 on 10.10.5.120"
  Write-Host ""
  Write-Host "Next: npm run db:backup:setup-nas"
} else {
  Write-Host "FAIL SMB port 445 on 10.10.5.120 not reachable"
  Write-Host ""
  Write-Host "Server route is set; IT must allow traffic on the core router."
  Write-Host "Send them: scripts/it-nas-route-request.txt"
}
