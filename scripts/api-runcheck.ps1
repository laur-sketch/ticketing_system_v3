# HTTP smoke test for local dev server (pages + API routes).
# Usage:
#   npm run api:runcheck
#   npm run api:runcheck -- -BaseUrl http://localhost:3000 -IncludeWarmPass
# Prerequisites: app running (e.g. npm run dev).

param(
  [string]$BaseUrl = "http://localhost:3000",
  [Alias("Warm")]
  [switch]$IncludeWarmPass
)

$ErrorActionPreference = "Stop"

$BaseUrl = $BaseUrl.TrimEnd("/")

$routes = @(
  @{ Path = "/"; Expect = 200; InspectJwt = $true },
  @{ Path = "/signin"; Expect = 200; InspectJwt = $true },
  @{ Path = "/api/auth/session"; Expect = 200; InspectJwt = $false },
  @{ Path = "/api/auth/providers"; Expect = 200; InspectJwt = $false },
  @{ Path = "/api/public/companies"; Expect = 200; InspectJwt = $false },
  @{ Path = "/api/brand/logo"; Expect = 200; InspectJwt = $false },
  @{ Path = "/api/notifications/unread-count?lastSeenMs=0"; Expect = 401; InspectJwt = $false },
  @{ Path = "/api/tickets?status=OPEN"; Expect = 401; InspectJwt = $false },
  @{ Path = "/api/dashboard/on-duty?page=1"; Expect = 401; InspectJwt = $false }
)

function Invoke-RouteCheck {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][int]$ExpectedStatus,
    [Parameter(Mandatory = $true)][bool]$InspectJwt
  )

  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 30 -MaximumRedirection 5
    $sw.Stop()
    $status = [int]$resp.StatusCode
    $bytes = if ($resp.Content) { $resp.Content.Length } else { 0 }
    $jwtError = $InspectJwt -and ($resp.Content -match "JWT_SESSION_ERROR")
    return @{
      Ok = ($status -eq $ExpectedStatus) -and (-not $jwtError)
      Status = $status
      Ms = $sw.ElapsedMilliseconds
      Bytes = $bytes
      JwtError = $jwtError
      Note = $null
    }
  } catch {
    $sw.Stop()
    $status = 0
    if ($_.Exception.Response) {
      $status = [int]$_.Exception.Response.StatusCode
    }
    return @{
      Ok = ($status -eq $ExpectedStatus)
      Status = $status
      Ms = $sw.ElapsedMilliseconds
      Bytes = 0
      JwtError = $false
      Note = if ($status -eq 0) { $_.Exception.Message } else { $null }
    }
  }
}

Write-Host "API runcheck against $BaseUrl"
Write-Host ""

# Reachability probe
try {
  $null = Invoke-WebRequest -Uri $BaseUrl -UseBasicParsing -TimeoutSec 10
} catch {
  Write-Error "Cannot reach $BaseUrl - start the app first (npm run dev). $($_.Exception.Message)"
}

$results = @()
foreach ($r in $routes) {
  $url = "$BaseUrl$($r.Path)"
  $routeParams = @{
    Url = $url
    ExpectedStatus = $r.Expect
    InspectJwt = $r.InspectJwt
  }
  $check = Invoke-RouteCheck @routeParams
  $results += [PSCustomObject]@{
    Route = $r.Path
    Status = $check.Status
    Expected = $r.Expect
    Ms = $check.Ms
    Bytes = $check.Bytes
    JwtError = $check.JwtError
    Ok = $check.Ok
    Note = $check.Note
  }
}

if ($IncludeWarmPass) {
  Write-Host ""
  Write-Host "Warm pass (2nd request):"
  $warmRoutes = @(
    @{ Path = "/api/auth/session"; Expect = 200 },
    @{ Path = "/api/public/companies"; Expect = 200 },
    @{ Path = "/api/brand/logo"; Expect = 200 },
    @{ Path = "/api/notifications/unread-count?lastSeenMs=0"; Expect = 401 },
    @{ Path = "/api/dashboard/on-duty?page=1"; Expect = 401 }
  )
  foreach ($warmRoute in $warmRoutes) {
    $warmPath = [string]$warmRoute.Path
    $warmExpect = [int]$warmRoute.Expect
    $warmUrl = "$BaseUrl$warmPath"
    $null = Invoke-RouteCheck -Url $warmUrl -ExpectedStatus $warmExpect -InspectJwt:0
    $warm = Invoke-RouteCheck -Url $warmUrl -ExpectedStatus $warmExpect -InspectJwt:0
    $label = if ($warm.Ok) { "OK" } else { "WARN" }
    Write-Host ("  [{0}] {1,-48} {2} {3}ms" -f $label, $warmPath, $warm.Status, $warm.Ms)
  }

  try {
    $sessionBody = (Invoke-WebRequest -Uri "$BaseUrl/api/auth/session" -UseBasicParsing -TimeoutSec 30).Content
    Write-Host "  Session body: $sessionBody"
  } catch {
    Write-Host "  Session body: (unavailable)"
  }
}

Write-Host ""
$results | Format-Table -AutoSize Route, Status, Expected, Ms, Bytes, JwtError, Ok -Wrap

$failed = @($results | Where-Object { -not $_.Ok })
if ($failed.Count -gt 0) {
  Write-Host ""
  Write-Error ('API runcheck failed: {0} route(s) did not match expected status or contained JWT errors.' -f $failed.Count)
}

Write-Host ""
Write-Host ('API runcheck passed ({0} routes).' -f $results.Count)
