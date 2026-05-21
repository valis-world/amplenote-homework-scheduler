param(
  [Parameter(Mandatory = $true)]
  [string]$WorkerUrl,

  [Parameter(Mandatory = $true)]
  [string]$AccessToken
)

$ErrorActionPreference = "Stop"

$url = $WorkerUrl.Trim()
$token = $AccessToken.Trim()
$preflightOk = $false

Write-Host "== Worker fetch =="
Write-Host $url

Write-Host ""
Write-Host "== CORS preflight =="
try {
  $preflight = Invoke-WebRequest `
    -Uri $url `
    -Method Options `
    -Headers @{
      Origin = "https://www.amplenote.com"
      "Access-Control-Request-Method" = "GET"
      "Access-Control-Request-Headers" = "authorization,accept"
    } `
    -UseBasicParsing `
    -TimeoutSec 30

  Write-Host "Status: $($preflight.StatusCode)"
  Write-Host "Access-Control-Allow-Origin: $($preflight.Headers['Access-Control-Allow-Origin'])"
  Write-Host "Access-Control-Allow-Methods: $($preflight.Headers['Access-Control-Allow-Methods'])"
  Write-Host "Access-Control-Allow-Headers: $($preflight.Headers['Access-Control-Allow-Headers'])"
  $preflightOk = $true
} catch {
  Write-Host "Preflight failed: $($_.Exception.Message)"

  if ($_.Exception.Response) {
    Write-Host "Status: $([int]$_.Exception.Response.StatusCode)"
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $body = $reader.ReadToEnd()
    if ($body) {
      Write-Host "Body:"
      Write-Host $body
    }
  }
}

Write-Host ""
try {
  $response = Invoke-WebRequest `
    -Uri $url `
    -Headers @{
      Authorization = "Bearer $token"
      Accept = "text/calendar, text/plain, */*"
      Origin = "https://www.amplenote.com"
    } `
    -UseBasicParsing `
    -TimeoutSec 30

  $text = [string]$response.Content
  Write-Host "Status: $($response.StatusCode)"
  Write-Host "Bytes:  $($text.Length)"
  Write-Host "Content-Type: $($response.Headers['Content-Type'])"
  Write-Host "Access-Control-Allow-Origin: $($response.Headers['Access-Control-Allow-Origin'])"

  if ($text -match 'BEGIN:VCALENDAR') {
    Write-Host "Looks like ICS: yes"
  } else {
    Write-Host "Looks like ICS: no"
  }

  Write-Host ""
  Write-Host "Preview:"
  $text.Split("`n") | Select-Object -First 12 | ForEach-Object { Write-Host $_ }
  if (-not $preflightOk) {
    Write-Host ""
    Write-Host "Fetch worked, but browser CORS preflight failed. Amplenote will still fail until OPTIONS works."
    exit 1
  }
  exit 0
} catch {
  Write-Host "Failed: $($_.Exception.Message)"

  if ($_.Exception.Response) {
    Write-Host "Status: $([int]$_.Exception.Response.StatusCode)"
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $body = $reader.ReadToEnd()
    if ($body) {
      Write-Host "Body:"
      Write-Host $body
    }
  }

  exit 1
}
