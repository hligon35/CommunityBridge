<#
Register the CommunityBridge Expo start script as a Windows service using NSSM.

Run this from an elevated PowerShell prompt (Run as Administrator):
    .\scripts\register-nssm.ps1

Options:
    -ServiceName : name of the Windows service (default: BuddyBoardExpo — legacy name kept for compatibility)
    -StartBat    : path to start-expo.bat (default: ..\\.expo\\start-expo.bat relative to this script)

The script will attempt to use Chocolatey if available, otherwise it will download NSSM
and install it under C:\Program Files\nssm. It then installs and starts the service.
#>

param(
    [string]$ServiceName = 'BuddyBoardExpo',
    [string]$StartBat = (Resolve-Path (Join-Path $PSScriptRoot "..\.expo\start-expo.bat"))
)

function Ensure-Admin {
    $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Write-Error "This script must be run as Administrator. Restart PowerShell 'Run as Administrator' and re-run the script."
        exit 1
    }
}

function Install-NSSM {
    # Try choco first
    if (Get-Command choco -ErrorAction SilentlyContinue) {
        Write-Host "Installing nssm via Chocolatey..."
        choco install nssm -y | Out-Null
        return (Get-Command nssm -ErrorAction SilentlyContinue).Source
    }

    Write-Host "Chocolatey not found — downloading nssm..."
    $zipUrl = 'https://nssm.cc/release/nssm-2.24.zip'
    $tmp = Join-Path $env:TEMP 'nssm.zip'
    Invoke-WebRequest -Uri $zipUrl -OutFile $tmp -UseBasicParsing
    $extract = Join-Path $env:TEMP 'nssm'
    if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
    Expand-Archive -Path $tmp -DestinationPath $extract
    $arch = if ([Environment]::Is64BitOperatingSystem) { 'win64' } else { 'win32' }
    $candidate = Get-ChildItem -Path $extract -Recurse -Filter nssm.exe | Where-Object { $_.FullName -like "*${arch}*" } | Select-Object -First 1
    if (-not $candidate) { Write-Error "Could not find nssm.exe in the archive."; exit 1 }
    $destDir = 'C:\Program Files\nssm'
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    Copy-Item -Path $candidate.FullName -Destination (Join-Path $destDir 'nssm.exe') -Force
    return (Join-Path $destDir 'nssm.exe')
}

Ensure-Admin

try {
    $startPath = (Resolve-Path $StartBat).Path
} catch {
    Write-Error "Could not find start-expo.bat at the expected path: $StartBat"
    exit 1
}

$nssmCmd = (Get-Command nssm -ErrorAction SilentlyContinue).Source
if (-not $nssmCmd) {
    $nssmCmd = Install-NSSM
}

Write-Host "Using nssm at: $nssmCmd"

& $nssmCmd install $ServiceName $startPath
& $nssmCmd set $ServiceName AppDirectory (Split-Path $startPath -Parent)
& $nssmCmd set $ServiceName Start SERVICE_AUTO_START

Write-Host "Starting service $ServiceName..."
& $nssmCmd start $ServiceName

Write-Host "Done. Use 'nssm status $ServiceName' or 'sc query $ServiceName' to check the service."
