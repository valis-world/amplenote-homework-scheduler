param(
  [Parameter(Mandatory = $true)]
  [string]$Url
)

$ErrorActionPreference = "Stop"

function Normalize-CalendarUrl {
  param([string]$InputUrl)

  $trimmed = $InputUrl.Trim()
  if ($trimmed -match '^webcal:') {
    return $trimmed -replace '^webcal:', 'https:'
  }
  return $trimmed
}

function Test-Fetch {
  param(
    [string]$Label,
    [string]$FetchUrl
  )

  Write-Host ""
  Write-Host "== $Label =="
  Write-Host $FetchUrl

  try {
    $response = Invoke-WebRequest -Uri $FetchUrl -UseBasicParsing -TimeoutSec 30
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
    return $true
  } catch {
    Write-Host "Failed: $($_.Exception.Message)"
    return $false
  }
}

$calendarUrl = Normalize-CalendarUrl $Url
$decodedCalendarUrl = [System.Uri]::UnescapeDataString($calendarUrl)

$proxyBuilderDecoded = [System.UriBuilder]"https://plugins.amplenote.com/cors-proxy"
$proxyBuilderDecoded.Query = "apiurl=$([System.Uri]::EscapeDataString($decodedCalendarUrl))"
$proxyUrlDecoded = $proxyBuilderDecoded.Uri.AbsoluteUri

$proxyBuilderOriginal = [System.UriBuilder]"https://plugins.amplenote.com/cors-proxy"
$proxyBuilderOriginal.Query = "apiurl=$([System.Uri]::EscapeDataString($calendarUrl))"
$proxyUrlOriginal = $proxyBuilderOriginal.Uri.AbsoluteUri

$proxyUrlRaw = "https://plugins.amplenote.com/cors-proxy?apiurl=$calendarUrl"

$directOk = Test-Fetch -Label "Direct fetch" -FetchUrl $calendarUrl
$proxyDecodedOk = Test-Fetch -Label "Amplenote proxy fetch, decoded URL" -FetchUrl $proxyUrlDecoded
$proxyOriginalOk = Test-Fetch -Label "Amplenote proxy fetch, original URL" -FetchUrl $proxyUrlOriginal
$proxyRawOk = Test-Fetch -Label "Amplenote proxy fetch, raw URL" -FetchUrl $proxyUrlRaw

Write-Host ""
Write-Host "== Result =="
if ($directOk -or $proxyDecodedOk -or $proxyOriginalOk -or $proxyRawOk) {
  Write-Host "At least one fetch path worked."
  exit 0
}

Write-Host "Both fetch paths failed."
exit 1
