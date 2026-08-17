param(
    [string]$Destination = "data/raw/hr/cau_staff_handbook_2026.pdf"
)

$ErrorActionPreference = "Stop"
$sourceUrl = "https://www.cau.edu/sites/default/files/2026-02/Handbook%20-%20Staff%20Working%20version%202026%20Feb9.pdf"
$serverRoot = Split-Path -Parent $PSScriptRoot
$destinationPath = Join-Path $serverRoot $Destination
$destinationDirectory = Split-Path -Parent $destinationPath

New-Item -ItemType Directory -Force -Path $destinationDirectory | Out-Null
Invoke-WebRequest -Uri $sourceUrl -OutFile $destinationPath

Write-Output "Downloaded the public CAU Staff Handbook to $destinationPath"
