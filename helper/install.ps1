param([Parameter(Mandatory=$true)][ValidatePattern('^[a-p]{32}$')][string]$ExtensionId)
$ErrorActionPreference = 'Stop'
$pythonExe = (Get-Command python.exe -ErrorAction Stop).Source
$helperRoot = $PSScriptRoot
$hostPath = Join-Path $helperRoot 'launch.cmd'
$manifestPath = Join-Path $helperRoot 'com.autofullscreen.pointer.json'
@"
@echo off
"$pythonExe" -u "$helperRoot\host.py"
"@ | Set-Content -LiteralPath $hostPath -Encoding Ascii
@{name='com.autofullscreen.pointer';description='Auto Fullscreen local window pointer tracking';path=$hostPath;type='stdio';allowed_origins=@("chrome-extension://$ExtensionId/")} | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding Ascii
# Chromium fallback registration plus Vivaldi's product-specific location.
foreach ($vendor in @('Google\Chrome', 'Vivaldi')) {
 $key = "HKCU:\Software\$vendor\NativeMessagingHosts\com.autofullscreen.pointer"
 New-Item -Path $key -Force | Out-Null
 Set-Item -LiteralPath $key -Value $manifestPath
}
Write-Host 'Registered for this Windows user. Keep this folder in place. Enable Windows helper in extension settings.'
