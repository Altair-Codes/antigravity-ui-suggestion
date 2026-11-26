$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "🚀 正在安装 Antigravity 引力套件 (Gravity Suite v2.1.3 · 纯 Node.js 全中文三扩展 Windows)..." -ForegroundColor Cyan

if (-not (Get-Command "node" -ErrorAction SilentlyContinue)) {
  Write-Error "❌ 未检测到 Node.js (>=20，推荐 v22+)，请先安装并加入 PATH。"
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

# 3. 将全部 3 个扩展的 sidecar.json command 适配为 node（UTF-8 无 BOM）
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$targets = @(
  (Join-Path $PluginsDst "gravity-hub\sidecars\dashboard\sidecar.json"),
  (Join-Path $PluginsDst "gravity-explorer\sidecars\panel\sidecar.json"),
  (Join-Path $PluginsDst "gravity-vault\sidecars\dock\sidecar.json")
)
foreach ($tPath in $targets) {
  $obj = Get-Content $tPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $obj.command = "node"
  [System.IO.File]::WriteAllText($tPath, ($obj | ConvertTo-Json -Depth 10), $utf8NoBom)
}
Write-Host "  • 已完成 3 个纯 Node.js 扩展的 Windows 启动命令适配"

# 4. 为 app.asar 开启 CDP 调试端口（若 Antigravity.exe 正在运行被锁，自动挂载退场瞬间替换并重启守护）
node (Join-Path $Here "enable-cdp.mjs")

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

Write-Host "✅ 引力套件 (Gravity Suite v2.1.3) 安装完成！现在只需关闭一次 Antigravity 窗口，全量汉化与 Gemini 五色流光即刻生效！" -ForegroundColor Green
