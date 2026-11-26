$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "🚀 正在安装 Antigravity 引力套件 (Gravity Suite v2.1.4 · 纯 Node.js 全中文三扩展 Windows)..." -ForegroundColor Cyan

$nodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Write-Error "❌ 未检测到 Node.js (>=20，推荐 v22.5+)，请先安装并加入 PATH。"
}
$nodeVerRaw = (& $nodeCmd.Source -v 2>$null).Trim()
Write-Host "  • Node.js: $($nodeCmd.Source) ($nodeVerRaw)" -ForegroundColor Gray
if ($nodeVerRaw -match '^v?(\d+)\.(\d+)') {
  $nMaj = [int]$Matches[1]; $nMin = [int]$Matches[2]
  if ($nMaj -lt 22 -or ($nMaj -eq 22 -and $nMin -lt 5)) {
    Write-Host "  ⚠️ 当前系统 PATH 中的 Node ($nodeVerRaw) 低于 v22.5（不自带 node:sqlite）；已启用降级兼容，新版 Antigravity 启动扩展时也会优先使用内置 Node 24。" -ForegroundColor Yellow
  }
}

$PluginsDst              = Join-Path $env:USERPROFILE ".gemini\config\plugins"
$GravityDataDst          = Join-Path $env:USERPROFILE ".gemini\antigravity\plugin_data\gravity-hub"
$GravitySidecarDataDst   = Join-Path $env:USERPROFILE ".gemini\antigravity\sidecar_data\gravity-hub\dashboard"
New-Item -ItemType Directory -Force -Path $PluginsDst, $GravityDataDst, $GravitySidecarDataDst | Out-Null

# 0. 平滑迁移旧版 nebula-hub 与 aura-dashboard 的账号备选金库与配置，并清理旧版插件目录
$LegacyDirs = @(
  (Join-Path $env:USERPROFILE ".gemini\antigravity\plugin_data\nebula-hub"),
  (Join-Path $env:USERPROFILE ".gemini\antigravity\sidecar_data\nebula-hub\dashboard"),
  (Join-Path $env:USERPROFILE ".gemini\antigravity\plugin_data\aura-dashboard"),
  (Join-Path $env:USERPROFILE ".gemini\antigravity\sidecar_data\aura-dashboard\dashboard")
)
foreach ($LegacyDir in $LegacyDirs) {
  if (Test-Path $LegacyDir) {
    foreach ($mf in @("accounts_vault.json", "account_timeline.json", "suite-auto-switch.json", "suite-last-route.json", "suite-update-state.json", "suite-account-prefs.json", "suite-auto-compact.json")) {
      $srcMf = Join-Path $LegacyDir $mf
      $dstMf1 = Join-Path $GravityDataDst $mf
      $dstMf2 = Join-Path $GravitySidecarDataDst $mf
      if ((Test-Path $srcMf) -and -not (Test-Path $dstMf1)) { Copy-Item -Force $srcMf $dstMf1 }
      if ((Test-Path $srcMf) -and -not (Test-Path $dstMf2)) { Copy-Item -Force $srcMf $dstMf2 }
    }
  }
}

foreach ($oldP in @("aura-dashboard", "nebula-hub", "workspace-file-tree", "file-launcher")) {
  $oldPath = Join-Path $PluginsDst $oldP
  if (Test-Path $oldPath) { Remove-Item -Recurse -Force $oldPath }
}

# 1. 复制安装全自研纯 Node.js 3 扩展（引力中枢 / 引力目录 / 引力文库）
foreach ($p in @("gravity-hub", "gravity-explorer", "gravity-vault")) {
  $src = Join-Path $Here "plugins\$p"
  $dst = Join-Path $PluginsDst $p
  if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
  Copy-Item -Recurse -Force $src $dst
}

# 2. 同步 Google Gemini 四色流体流光主题、零遮挡遥测舱与全量汉化配置到全部候选目录
$GravityUserSeedDst = Join-Path $PluginsDst "gravity-hub\sidecars\dashboard\user"
New-Item -ItemType Directory -Force -Path $GravityUserSeedDst | Out-Null
foreach ($f in @("config.json", "custom.css", "custom.js", "i18n.override.json")) {
  $srcFile = Join-Path $Here "plugin_data\gravity-hub\$f"
  Copy-Item -Force $srcFile (Join-Path $GravityDataDst $f)
  Copy-Item -Force $srcFile (Join-Path $GravitySidecarDataDst $f)
  Copy-Item -Force $srcFile (Join-Path $GravityUserSeedDst $f)
}
$VerFile = Join-Path $Here "version.json"
if (Test-Path $VerFile) {
  Copy-Item -Force $VerFile (Join-Path $GravityDataDst "suite-version.json")
  Copy-Item -Force $VerFile (Join-Path $GravitySidecarDataDst "suite-version.json")
  Copy-Item -Force $VerFile (Join-Path $GravityUserSeedDst "suite-version.json")
}

# 3. 使用 Node.js 原生 UTF-8 无 BOM 校验并确保 3 个扩展的 sidecar.json command 为 node
$targets = @(
  (Join-Path $PluginsDst "gravity-hub\sidecars\dashboard\sidecar.json"),
  (Join-Path $PluginsDst "gravity-explorer\sidecars\panel\sidecar.json"),
  (Join-Path $PluginsDst "gravity-vault\sidecars\dock\sidecar.json")
)
node -e '
const fs = require("node:fs");
for (const p of process.argv.slice(1)) {
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  data.command = "node";
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");
}
' @targets
Write-Host "  • 已完成 3 个纯 Node.js 扩展的 Windows 启动配置校验"

# 4. 为 app.asar 开启 CDP 调试端口（容错：若安装在 Program Files 无写权限则不阻塞快捷方式注入）
try {
  node (Join-Path $Here "enable-cdp.mjs")
} catch {
  Write-Host "  ⚠️ [CDP] enable-cdp.mjs 执行出现异常（将由快捷方式 --remote-debugging-port=0 兜底）：$($_.Exception.Message)" -ForegroundColor Yellow
}

# 5. 同时为桌面与开始菜单的 Antigravity 快捷方式加上 --remote-debugging-port=0
try {
  $WshShell = New-Object -ComObject WScript.Shell
  $lnkRoots = @(
    [Environment]::GetFolderPath("Desktop"),
    (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs")
  )
  foreach ($root in $lnkRoots) {
    if (Test-Path $root) {
      Get-ChildItem -Path $root -Filter "*Antigravity*.lnk" -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
        $sc = $WshShell.CreateShortcut($_.FullName)
        if ($sc.Arguments -notmatch "remote-debugging-port") {
          $sc.Arguments = (($sc.Arguments + " --remote-debugging-port=0").Trim())
          $sc.Save()
        }
      }
    }
  }
} catch {}

# 6. 如未安装官方 Antigravity CLI (agy)，自动安装
if (-not (Get-Command "agy" -ErrorAction SilentlyContinue)) {
  Write-Host "  • 正在安装官方 Antigravity CLI (agy)..."
  try { irm https://antigravity.google/cli/install.ps1 | iex } catch {}
}

# 7. 安装后 Windows 环境自检（sidecar_sdk、三扩展试启动、系统代理回环绕过检测）
Write-Host "`n🔍 正在执行 Windows 三扩展启动自检..." -ForegroundColor Cyan
$sdkEntry = Join-Path $env:USERPROFILE ".gemini\antigravity\lib\node_modules\sidecar_sdk\index.mjs"
if (Test-Path $sdkEntry) {
  Write-Host "  • [SDK] 已找到 sidecar_sdk: $sdkEntry" -ForegroundColor Gray
} else {
  Write-Host "  ⚠️ [SDK] 未检测到 $sdkEntry（若尚未登录/初始化过 Antigravity，请先登录客户端一次再重试）" -ForegroundColor Yellow
}

$sidecarEntries = @(
  @{ Name = "引力中枢 (gravity-hub)"; Path = (Join-Path $PluginsDst "gravity-hub\sidecars\dashboard\main.mjs") },
  @{ Name = "引力目录 (gravity-explorer)"; Path = (Join-Path $PluginsDst "gravity-explorer\sidecars\panel\main.mjs") },
  @{ Name = "引力文库 (gravity-vault)"; Path = (Join-Path $PluginsDst "gravity-vault\sidecars\dock\main.mjs") }
)

$prevLsAddr = $env:ANTIGRAVITY_LS_ADDRESS
$prevCsrf = $env:ANTIGRAVITY_CSRF_TOKEN
$prevPort = $env:ANTIGRAVITY_SIDECAR_WEB_PORT
try {
  $env:ANTIGRAVITY_LS_ADDRESS = "127.0.0.1:5387"
  $env:ANTIGRAVITY_CSRF_TOKEN = "install-check"
  foreach ($item in $sidecarEntries) {
    $entryPath = $item.Path
    & $nodeCmd.Source --check $entryPath 2>$null
    if ($LASTEXITCODE -ne 0) {
      Write-Host "  ❌ [$($item.Name)] 语法检查失败: $entryPath" -ForegroundColor Red
      continue
    }
    $env:ANTIGRAVITY_SIDECAR_WEB_PORT = "0"
    $outTmp = Join-Path $env:TEMP "ag_check_out.txt"
    $errTmp = Join-Path $env:TEMP "ag_check_err.txt"
    Remove-Item $outTmp, $errTmp -ErrorAction SilentlyContinue
    $proc = Start-Process -FilePath $nodeCmd.Source -ArgumentList "`"$entryPath`"" -NoNewWindow -PassThru -RedirectStandardOutput $outTmp -RedirectStandardError $errTmp
    Start-Sleep -Milliseconds 1500
    if (-not $proc.HasExited) {
      Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
      Write-Host "  ✅ [$($item.Name)] 试启动正常" -ForegroundColor Green
    } else {
      Write-Host "  ❌ [$($item.Name)] 试启动退出 (code=$($proc.ExitCode))" -ForegroundColor Red
      if (Test-Path $errTmp) { Get-Content $errTmp -Tail 12 | ForEach-Object { Write-Host "     $_" -ForegroundColor Red } }
      if (Test-Path $outTmp) { Get-Content $outTmp -Tail 6 | ForEach-Object { Write-Host "     $_" -ForegroundColor DarkGray } }
    }
    Remove-Item $outTmp, $errTmp -ErrorAction SilentlyContinue
  }
} finally {
  $env:ANTIGRAVITY_LS_ADDRESS = $prevLsAddr
  $env:ANTIGRAVITY_CSRF_TOKEN = $prevCsrf
  $env:ANTIGRAVITY_SIDECAR_WEB_PORT = $prevPort
}

try {
  $inet = Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" -ErrorAction SilentlyContinue
  if ($inet -and $inet.ProxyEnable -eq 1) {
    $ov = [string]($inet.ProxyOverride)
    if ($ov -notmatch '<local>|127\.0\.0\.1|localhost') {
      Write-Host "  ⚠️ 检测到系统代理 ($($inet.ProxyServer)) 未配置绕过本地回环 (<local>;127.0.0.1;localhost)，可能导致侧边栏扩展白屏！建议在 Windows 代理设置中勾选「请勿将代理服务器用于本地(Intranet)地址」或加入 127.0.0.1;localhost;<local>。" -ForegroundColor Yellow
    }
  }
} catch {}

$bootLog = Join-Path $env:USERPROFILE ".gemini\antigravity\sidecar_data\gravity-suite-boot.log"
$agLogs = Join-Path $env:APPDATA "Antigravity\logs"
Write-Host "  • 启动日志路径: $bootLog" -ForegroundColor Gray
Write-Host "  • 客户端日志目录: $agLogs" -ForegroundColor Gray

Write-Host "`n✅ 引力套件 (Gravity Suite v2.1.4) 安装完成！现在只需关闭一次 Antigravity 窗口，全量汉化与 Gemini 五色流光即刻生效！" -ForegroundColor Green
