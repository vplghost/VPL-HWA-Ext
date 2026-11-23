<#
.SYNOPSIS
    Installs Chrome Native Messaging Host for WXT Unity Debug Bridge on Windows.
.PARAMETER ExtensionId
    The Chrome Extension ID (from chrome://extensions with Developer Mode on).
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\debug-bridge\install-windows.ps1 -ExtensionId "abcdefghijklmnop..."
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, HelpMessage = "Extension ID from chrome://extensions")]
    [string]$ExtensionId
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$hostBatPath = Join-Path $scriptDir "host.bat"
$manifestJsonPath = Join-Path $scriptDir "com.local.wxt_unity_bridge.json"
$hostName = "com.local.wxt_unity_bridge"
$regKeyPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  WXT Unity Debug Bridge: Windows Registry & Host Setup   " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Detect absolute path to node.exe
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Error "node.exe was not found in PATH. Please ensure Node.js is installed."
    exit 1
}
$nodeExePath = $nodeCmd.Source
Write-Host "[+] Found Node.js at: $nodeExePath" -ForegroundColor Green

# 2. Update host.bat with absolute path to node.exe (required for Chrome Native Messaging)
$hostBatContent = @"
@echo off
rem Wrapper batch script for Chrome Native Messaging on Windows
"$nodeExePath" "%~dp0host.js" %*
"@
[System.IO.File]::WriteAllText($hostBatPath, $hostBatContent, [System.Text.Encoding]::ASCII)
Write-Host "[+] Updated host.bat with absolute Node path: $hostBatPath" -ForegroundColor Green

# 3. Create Native Messaging Host Manifest JSON
$escapedBatPath = $hostBatPath.Replace('\', '\\')
$manifestContent = @"
{
  "name": "$hostName",
  "description": "WXT Unity Debug Bridge Native Messaging Host",
  "path": "$escapedBatPath",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$ExtensionId/"
  ]
}
"@
[System.IO.File]::WriteAllText($manifestJsonPath, $manifestContent, [System.Text.Encoding]::UTF8)
Write-Host "[+] Created host manifest: $manifestJsonPath" -ForegroundColor Green
Write-Host "    Allowed origin: chrome-extension://$ExtensionId/" -ForegroundColor Gray

# 4. Write Windows Registry Key
if (-not (Test-Path $regKeyPath)) {
    New-Item -Path $regKeyPath -Force | Out-Null
}
Set-ItemProperty -Path $regKeyPath -Name "(Default)" -Value $manifestJsonPath -Force
Write-Host "[+] Registered in Windows Registry:" -ForegroundColor Green
Write-Host "    Key: $regKeyPath" -ForegroundColor Gray
Write-Host "    Default Value: $manifestJsonPath" -ForegroundColor Gray

Write-Host "`n[SUCCESS] Native Messaging Host installed successfully!" -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host " 1. Make sure you built with VITE_DEBUG_BRIDGE=true (npm run wxt:build)" -ForegroundColor White
Write-Host " 2. Reload the extension in chrome://extensions" -ForegroundColor White
Write-Host " 3. Open Hero Wars Alliance tab" -ForegroundColor White
Write-Host " 4. Test live bridge via curl:" -ForegroundColor White
Write-Host "    curl http://127.0.0.1:9876/status" -ForegroundColor Cyan
Write-Host "    curl -X POST http://127.0.0.1:9876/eval -H ""Content-Type: application/json"" -d '{""code"": ""window.location.href""}'" -ForegroundColor Cyan
