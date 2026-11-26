param(
  [switch]$Force,
  [switch]$DryRun,
  [switch]$NoRelaunch
)

$ErrorActionPreference = "Stop"

Write-Host "🧹 Antigravity 引力套件彻底卸载向导 (Windows)" -ForegroundColor Cyan
Write-Host "------------------------------------------------"

$SuiteNames = @(
  "gravity-hub",
  "gravity-explorer",
  "gravity-vault",
  "aura-dashboard",
  "nebula-hub",
  "workspace-file-tree",
  "file-launcher"
)

$PluginsRoot     = Join-Path $env:USERPROFILE ".gemini\config\plugins"
$PluginDataRoot  = Join-Path $env:USERPROFILE ".gemini\antigravity\plugin_data"
$SidecarDataRoot = Join-Path $env:USERPROFILE ".gemini\antigravity\sidecar_data"

$RemoveTargets = New-Object System.Collections.Generic.List[string]
foreach ($name in $SuiteNames) {
  foreach ($base in @($PluginsRoot, $PluginDataRoot, $SidecarDataRoot)) {
    $p = Join-Path $base $name
    if (Test-Path -LiteralPath $p) { $RemoveTargets.Add($p) }
  }
}

$BootLog = Join-Path $SidecarDataRoot "gravity-suite-boot.log"
if (Test-Path -LiteralPath $BootLog) { $RemoveTargets.Add($BootLog) }

$ShortcutTargets = New-Object System.Collections.Generic.List[string]
try {
  $WshShell = New-Object -ComObject WScript.Shell
  $LnkRoots = @(
    [Environment]::GetFolderPath("Desktop"),
    (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs")
  )
  foreach ($root in $LnkRoots) {
    if ($root -and (Test-Path -LiteralPath $root)) {
      Get-ChildItem -Path $root -Filter "*Antigravity*.lnk" -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
        $sc = $WshShell.CreateShortcut($_.FullName)
        if ($sc.Arguments -match "remote-debugging-port") {
          $ShortcutTargets.Add($_.FullName)
        }
      }
    }
  }
} catch {}

$AsarCandidates = New-Object System.Collections.Generic.List[string]
$RunningExe = ""
try {
  $proc = Get-Process -Name Antigravity -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($proc -and $proc.Path) {
    $RunningExe = $proc.Path
    $AsarCandidates.Add((Join-Path (Split-Path -Parent $RunningExe) "resources\app.asar"))
  }
} catch {}

$LocalApp = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $env:USERPROFILE "AppData\Local" }
$Prog     = if ($env:ProgramFiles) { $env:ProgramFiles } else { "C:\Program Files" }
$Prog86   = if (${env:ProgramFiles(x86)}) { ${env:ProgramFiles(x86)} } else { "C:\Program Files (x86)" }
foreach ($cand in @(
  (Join-Path $LocalApp "Programs\Antigravity\resources\app.asar"),
  (Join-Path $LocalApp "Programs\antigravity\resources\app.asar"),
  (Join-Path $LocalApp "Programs\Google Antigravity\resources\app.asar"),
  (Join-Path $Prog "Antigravity\resources\app.asar"),
  (Join-Path $Prog "Google Antigravity\resources\app.asar"),
  (Join-Path $Prog86 "Antigravity\resources\app.asar")
)) {
  if (-not $AsarCandidates.Contains($cand)) { $AsarCandidates.Add($cand) }
}

$RestoreAsarTargets = New-Object System.Collections.Generic.List[string]
foreach ($asar in $AsarCandidates) {
  $bak = "$asar.bak"
  $pending = "$asar.cdp_pending"
  if ((Test-Path -LiteralPath $bak) -and (-not $RestoreAsarTargets.Contains($bak))) {
    $RestoreAsarTargets.Add($bak)
  }
  if ((Test-Path -LiteralPath $pending) -and (-not $RemoveTargets.Contains($pending))) {
    $RemoveTargets.Add($pending)
  }
}

if ($RemoveTargets.Count -eq 0 -and $ShortcutTargets.Count -eq 0 -and $RestoreAsarTargets.Count -eq 0) {
  Write-Host "✅ 未检测到任何引力套件残留文件，当前已是纯净原生 Antigravity 环境。" -ForegroundColor Green
  exit 0
}

Write-Host "以下引力套件扩展、配置与启动参数将被清除：" -ForegroundColor Yellow
foreach ($p in $RemoveTargets) { Write-Host "  • [删除] $p" }
foreach ($lnk in $ShortcutTargets) { Write-Host "  • [移除调试参数] $lnk" }
foreach ($bak in $RestoreAsarTargets) { Write-Host "  • [还原] $bak -> $($bak -replace '\.bak$','')" }
Write-Host ""
Write-Host "✅ 以下官方原生数据将完整保留，绝不触碰：" -ForegroundColor Green
Write-Host "  • Antigravity 本体应用与历史对话记录 (.gemini\antigravity\conversations\)"
Write-Host "  • 官方账号登录状态 (app_storage.json) 与无关第三方扩展"
Write-Host ""

if ($DryRun) {
  Write-Host "🔍 [DryRun] 预览结束，未修改任何文件。" -ForegroundColor Cyan
  exit 0
}

if (-not $Force) {
  $ans = Read-Host "确认彻底清除以上引力套件产物并还原原生 Antigravity？[y/N]"
  if ($ans -notmatch '^(y|yes)$') {
    Write-Host "已取消卸载。" -ForegroundColor Gray
    exit 0
  }
}

foreach ($lnk in $ShortcutTargets) {
  try {
    $sc = $WshShell.CreateShortcut($lnk)
    $nextArgs = ($sc.Arguments -replace '(?i)(^|\s)--remote-debugging-port(=\S+)?', ' ').Trim()
    if ($nextArgs -ne $sc.Arguments) {
      $sc.Arguments = $nextArgs
      $sc.Save()
      Write-Host "  ✓ 已移除快捷方式调试参数: $lnk" -ForegroundColor Green
    }
  } catch {
    Write-Host "  ⚠️ 移除快捷方式参数失败: $lnk" -ForegroundColor Yellow
  }
}

$DelayedRemoves = New-Object System.Collections.Generic.List[string]
foreach ($p in $RemoveTargets) {
  try {
    Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction Stop
    Write-Host "  ✓ 已删除: $p" -ForegroundColor Green
  } catch {
    $DelayedRemoves.Add($p)
    Write-Host "  ⏳ 文件正在被占用，将在关闭 Antigravity 后清理: $p" -ForegroundColor Yellow
  }
}

$PendingRestoreAsar = $null
foreach ($bak in $RestoreAsarTargets) {
  $dstAsar = $bak -replace '\.bak$', ''
  try {
    Copy-Item -LiteralPath $bak -Destination $dstAsar -Force -ErrorAction Stop
    Remove-Item -LiteralPath $bak -Force -ErrorAction SilentlyContinue
    Write-Host "  ✓ 已还原官方 app.asar: $dstAsar" -ForegroundColor Green
  } catch {
    $PendingRestoreAsar = @{ Bak = $bak; Dst = $dstAsar }
    Write-Host "  ⏳ app.asar 正在被占用，将在关闭 Antigravity 后自动还原" -ForegroundColor Yellow
  }
}

$isRunning = [bool](Get-Process -Name Antigravity -ErrorAction SilentlyContinue)
if (($DelayedRemoves.Count -gt 0) -or ($null -ne $PendingRestoreAsar) -or ($isRunning -and (-not $NoRelaunch))) {
  $exeToLaunch = $RunningExe
  if (-not $exeToLaunch -and $AsarCandidates.Count -gt 0) {
    foreach ($c in $AsarCandidates) {
      $maybe = Join-Path (Split-Path -Parent (Split-Path -Parent $c)) "Antigravity.exe"
      if (Test-Path -LiteralPath $maybe) { $exeToLaunch = $maybe; break }
    }
  }
  $psLines = New-Object System.Collections.Generic.List[string]
  $psLines.Add('$ErrorActionPreference = "SilentlyContinue"')
  $psLines.Add('Stop-Process -Name Antigravity -ErrorAction SilentlyContinue')
  $psLines.Add('Wait-Process -Name Antigravity -Timeout 10 -ErrorAction SilentlyContinue')
  $psLines.Add('Start-Sleep -Milliseconds 700')
  if ($null -ne $PendingRestoreAsar) {
    $bEsc = $PendingRestoreAsar.Bak.Replace("'", "''")
    $dEsc = $PendingRestoreAsar.Dst.Replace("'", "''")
    $psLines.Add("Move-Item -LiteralPath '$bEsc' -Destination '$dEsc' -Force")
  }
  foreach ($dp in $DelayedRemoves) {
    $pEsc = $dp.Replace("'", "''")
    $psLines.Add("if (Test-Path -LiteralPath '$pEsc') { Remove-Item -LiteralPath '$pEsc' -Recurse -Force }")
  }
  if ((-not $NoRelaunch) -and $exeToLaunch) {
    $eEsc = $exeToLaunch.Replace("'", "''")
    $psLines.Add("if (Test-Path -LiteralPath '$eEsc') { Start-Process -FilePath '$eEsc' }")
  }
  $scriptText = $psLines -join "`n"
  $encoded = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($scriptText))
  Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-WindowStyle", "Hidden", "-EncodedCommand", $encoded) -WindowStyle Hidden | Out-Null
  Write-Host "`n🔄 正在结束占用进程并完成最终清理，随后以官方原生模式重启 Antigravity..." -ForegroundColor Cyan
} else {
  Write-Host "`n✅ 彻底清除完成！现在可直接打开官方 Antigravity，已恢复纯净原生状态。" -ForegroundColor Green
}
