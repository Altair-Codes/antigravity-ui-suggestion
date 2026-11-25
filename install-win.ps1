$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "🚀 正在安装 Antigravity 星云中枢 (Nebula Hub v2.0) 与全中文三扩展套件 (Windows)..." -ForegroundColor Cyan

foreach ($cmd in @("node", "python")) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Write-Error "❌ 未检测到 $cmd，请先安装 Node.js (>=20) 与 Python 3 并加入 PATH。"
  }
}

$PluginsDst            = Join-Path $env:USERPROFILE ".gemini\config\plugins"
$NebulaDataDst         = Join-Path $env:USERPROFILE ".gemini\antigravity\plugin_data\nebula-hub"
$NebulaSidecarDataDst  = Join-Path $env:USERPROFILE ".gemini\antigravity\sidecar_data\nebula-hub\dashboard"
$LegacyAuraData        = Join-Path $env:USERPROFILE ".gemini\antigravity\plugin_data\aura-dashboard"
New-Item -ItemType Directory -Force -Path $PluginsDst, $NebulaDataDst, $NebulaSidecarDataDst | Out-Null

# 0. 平滑迁移旧版 aura-dashboard 的账号备选金库与配置并清理旧插件目录
if (Test-Path $LegacyAuraData) {
  foreach ($mf in @("accounts_vault.json", "account_timeline.json", "suite-auto-switch.json", "suite-last-route.json", "suite-update-state.json")) {
    $srcMf = Join-Path $LegacyAuraData $mf
    $dstMf1 = Join-Path $NebulaDataDst $mf
    $dstMf2 = Join-Path $NebulaSidecarDataDst $mf
    if ((Test-Path $srcMf) -and -not (Test-Path $dstMf1)) { Copy-Item -Force $srcMf $dstMf1 }
    if ((Test-Path $srcMf) -and -not (Test-Path $dstMf2)) { Copy-Item -Force $srcMf $dstMf2 }
  }
  Write-Host "  • 已从旧版 aura-dashboard 无损迁移多账号金库与配置至星云中枢 (nebula-hub)"
}
$OldAuraPlugin = Join-Path $PluginsDst "aura-dashboard"
if (Test-Path $OldAuraPlugin) { Remove-Item -Recurse -Force $OldAuraPlugin }

# 1. 复制已定制好的 3 个扩展 (星云中枢 / 项目文件 / 文件启动器)
foreach ($p in @("nebula-hub", "workspace-file-tree", "file-launcher")) {
  $src = Join-Path $Here "plugins\$p"
  $dst = Join-Path $PluginsDst $p
  if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
  Copy-Item -Recurse -Force $src $dst
}

# 2. 同步 Google Gemini 四色流体流光主题、一体式遥测舱与全量汉化配置到全部候选目录
$NebulaUserSeedDst = Join-Path $PluginsDst "nebula-hub\sidecars\dashboard\user"
New-Item -ItemType Directory -Force -Path $NebulaUserSeedDst | Out-Null
foreach ($f in @("config.json", "custom.css", "custom.js", "i18n.override.json")) {
  $srcFile = Join-Path $Here "plugin_data\nebula-hub\$f"
  Copy-Item -Force $srcFile (Join-Path $NebulaDataDst $f)
  Copy-Item -Force $srcFile (Join-Path $NebulaSidecarDataDst $f)
  Copy-Item -Force $srcFile (Join-Path $NebulaUserSeedDst $f)
}
$VerFile = Join-Path $Here "version.json"
if (Test-Path $VerFile) {
  Copy-Item -Force $VerFile (Join-Path $NebulaDataDst "suite-version.json")
  Copy-Item -Force $VerFile (Join-Path $NebulaSidecarDataDst "suite-version.json")
  Copy-Item -Force $VerFile (Join-Path $NebulaUserSeedDst "suite-version.json")
}

# 3. 将 sidecar.json 的 command 适配为 Windows 标准 node / python（UTF-8 无 BOM）
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$targets = @(
  @{ Path = (Join-Path $PluginsDst "nebula-hub\sidecars\dashboard\sidecar.json"); Cmd = "node" },
  @{ Path = (Join-Path $PluginsDst "workspace-file-tree\sidecars\panel\sidecar.json"); Cmd = "node" },
  @{ Path = (Join-Path $PluginsDst "file-launcher\sidecars\launcher_pane\sidecar.json"); Cmd = "python" }
)
foreach ($t in $targets) {
  $obj = Get-Content $t.Path -Raw -Encoding UTF8 | ConvertFrom-Json
  $obj.command = $t.Cmd
  [System.IO.File]::WriteAllText($t.Path, ($obj | ConvertTo-Json -Depth 10), $utf8NoBom)
}
Write-Host "  • 已完成 3 个扩展的 Windows 启动命令适配"

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

Write-Host "✅ 星云中枢 (Nebula Hub v2.0) 安装完成！现在只需关闭一次 Antigravity 窗口，全量汉化与 Gemini 四色流光即刻生效！" -ForegroundColor Green
