$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$pythonConsole = (Get-Command python.exe -ErrorAction Stop).Source
$pythonHidden = Join-Path (Split-Path -Parent $pythonConsole) 'pythonw.exe'
if (-not (Test-Path -LiteralPath $pythonHidden)) { throw 'pythonw.exe was not found beside Python.' }
$workingBranch = (& git -C $projectRoot branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or -not $workingBranch) { throw 'The project must be on a named Git branch.' }
$runtimeState = Join-Path $env:LOCALAPPDATA 'VexedMirror'
New-Item -ItemType Directory -Path $runtimeState -Force | Out-Null
$arguments = '"' + (Join-Path $projectRoot 'tools\local_site.py') + '" --repo "' + $projectRoot + '" --state "' + $runtimeState + '" --branch "' + $workingBranch + '"'
$action = New-ScheduledTaskAction -Execute $pythonHidden -Argument $arguments -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'Vexed Mirror Local Site' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Standalone local Vexed Mirror website with checked GitHub synchronization.' -Force | Out-Null
Start-ScheduledTask -TaskName 'Vexed Mirror Local Site'
$desktopRoot = [Environment]::GetFolderPath('Desktop')
$shortcut = Join-Path $desktopRoot 'Vexed Mirror.url'
if (Test-Path -LiteralPath $shortcut) {
    $existingShortcut = Get-Content -LiteralPath $shortcut -Raw
    if ($existingShortcut -notmatch 'URL=http://127\.0\.0\.1:7790/') { throw "An unrelated shortcut already exists at $shortcut" }
}
Set-Content -LiteralPath $shortcut -Value "[InternetShortcut]`r`nURL=http://127.0.0.1:7790/`r`n" -Encoding ASCII
Write-Output 'Installed Vexed Mirror: http://127.0.0.1:7790/'
Write-Output "Sync status: $runtimeState\status.json"
