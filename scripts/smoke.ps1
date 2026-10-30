$ErrorActionPreference = 'Stop'
$base = 'http://localhost:4000/api'
$h = @{ 'X-Requested-With' = 'webplay' }
$pw = (Get-Content "$PSScriptRoot\..\backend\.env" | Where-Object { $_ -like 'SEED_PASSWORD=*' }).Split('=')[1]
function Call($method, $path, $body, $session, $extra) {
  $headers = @{ 'X-Requested-With' = 'webplay' }
  if ($extra) { $extra.GetEnumerator() | ForEach-Object { $headers[$_.Key] = $_.Value } }
  $args = @{ Uri = "$base$path"; Method = $method; Headers = $headers; WebSession = $session; ContentType = 'application/json'; UseBasicParsing = $true }
  if ($body) { $args.Body = ($body | ConvertTo-Json -Depth 6) }
  try { return Invoke-RestMethod @args } catch {
    $r = $_.Exception.Response
    $txt = if ($r) { (New-Object IO.StreamReader($r.GetResponseStream())).ReadToEnd() } else { $_.Exception.Message }
    return "ERR $([int]$r.StatusCode): $txt"
  }
}
"health:"; Call GET '/health' $null $null
$s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
"login cliente:"; (Call POST '/auth/login' @{ email = 'cliente@webplay.test'; password = $pw } $s) | ConvertTo-Json -Depth 5 -Compress
"overview:"; (Call GET '/tenant/overview' $null $s) | ConvertTo-Json -Depth 4 -Compress
"servers:"; (Call GET '/tenant/servers' $null $s) | ConvertTo-Json -Depth 4 -Compress
"test server:"; (Call POST '/tenant/servers/1/test' $null $s) | ConvertTo-Json -Depth 4 -Compress
"refresh:"; (Call POST '/tenant/servers/1/refresh' $null $s) | ConvertTo-Json -Depth 4 -Compress
$v = New-Object Microsoft.PowerShell.Commands.WebRequestSession
"viewer login:"; $vl = Call POST '/v/demo/login' @{ email = 'espectador@webplay.test'; password = $pw } $v; $vl | ConvertTo-Json -Depth 4 -Compress
$pid1 = $vl.profiles[0].id
$ph = @{ 'X-Profile-Id' = "$pid1" }
"home:"; $home1 = Call GET '/v/demo/home' $null $v $ph; ($home1.rails | ForEach-Object { "$($_.title): $($_.items.Count)" }) -join '; '
"play:"; (Call GET '/v/demo/play/live/100' $null $v $ph) | ConvertTo-Json -Depth 4 -Compress
"fav:"; (Call PUT '/v/demo/favorites' @{ serverId = 1; contentType = 'live'; streamId = '100'; name = 'Canal Demo 1' } $v $ph) | ConvertTo-Json -Compress
"favs:"; (Call GET '/v/demo/favorites' $null $v $ph) | ConvertTo-Json -Depth 4 -Compress
"search:"; $sr = Call GET '/v/demo/search?q=filme' $null $v $ph; "live=$($sr.live.Count) vod=$($sr.vod.Count)"
$m = New-Object Microsoft.PowerShell.Commands.WebRequestSession
"master login:"; (Call POST '/auth/login' @{ email = 'santosjhonatan5@gmail.com'; password = $pw } $m) | ConvertTo-Json -Depth 3 -Compress
"dashboard:"; (Call GET '/master/dashboard' $null $m) | ConvertTo-Json -Depth 5 -Compress
"tenants:"; (Call GET '/master/tenants' $null $m) | ConvertTo-Json -Depth 4 -Compress
"mp:"; (Call GET '/master/mercadopago' $null $m) | ConvertTo-Json -Depth 5 -Compress
"checkout sem mp:"; Call POST '/tenant/payments/checkout' @{ method = 'pix' } $s
