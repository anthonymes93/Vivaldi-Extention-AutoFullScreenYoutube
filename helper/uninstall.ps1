$ErrorActionPreference = 'Stop'
foreach ($vendor in @('Google\Chrome', 'Vivaldi')) {
 $key = "HKCU:\Software\$vendor\NativeMessagingHosts\com.autofullscreen.pointer"
 if (Test-Path -LiteralPath $key) { Remove-Item -LiteralPath $key }
}
Write-Host 'Native host registration removed. Select browser-only detection in settings.'
