# One-shot Android SDK component installer for tauri android build verification.
# Usage: pwsh -File scripts/android-sdk-setup.ps1
$ErrorActionPreference = 'Continue'
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot'
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
$mgr = "$sdk\cmdline-tools\latest\bin\sdkmanager.bat"

# Accept all licenses (feed 'y' repeatedly)
$yes = ("y`n" * 40)
$yes | & $mgr --licenses --sdk_root=$sdk | Select-Object -Last 2

# Install required components
& $mgr --sdk_root=$sdk --install `
    "platform-tools" `
    "platforms;android-34" `
    "build-tools;34.0.0" `
    "ndk;26.3.11579264" | Select-Object -Last 5

Write-Host "=== Installed components ==="
Get-ChildItem $sdk -Directory | Select-Object -ExpandProperty Name
