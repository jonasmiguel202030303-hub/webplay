# Uso: powershell -ExecutionPolicy Bypass -File scripts\dev-db.ps1 [start|stop|status]
# MariaDB portátil de desenvolvimento em C:\webplay-data (fora do OneDrive), porta 3307.
param([string]$Action = "start")

$bin = "C:\webplay-data\mariadb\bin"
$ini = "C:\webplay-data\mysql\my.ini"

switch ($Action) {
  "start" {
    if (Get-NetTCPConnection -LocalPort 3307 -State Listen -ErrorAction SilentlyContinue) { Write-Host "MariaDB já está em execução na porta 3307."; break }
    Start-Process -FilePath "$bin\mysqld.exe" -ArgumentList "--defaults-file=$ini", "--console" -WindowStyle Hidden
    Start-Sleep -Seconds 5
    Write-Host "MariaDB iniciado na porta 3307."
  }
  "stop" { & "$bin\mariadb-admin.exe" -u root -P 3307 -h 127.0.0.1 shutdown }
  "status" { if (Get-NetTCPConnection -LocalPort 3307 -State Listen -ErrorAction SilentlyContinue) { "ativo" } else { "parado" } }
}
