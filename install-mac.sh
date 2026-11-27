#!/usr/bin/env bash
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
echo "🚀 正在安装 Antigravity 引力套件 (Gravity Suite v2.2.3 · 纯 Node.js 全中文三扩展)..."

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ] && [ -d "$HOME/.nvm/versions/node" ]; then
  NODE_BIN="$(find "$HOME/.nvm/versions/node" -maxdepth 3 -name node -type f | sort -V | tail -n 1)"
fi
if [ -z "$NODE_BIN" ] && [ -x "/opt/homebrew/bin/node" ]; then
  NODE_BIN="/opt/homebrew/bin/node"
fi
if [ -z "$NODE_BIN" ] && [ -x "/usr/local/bin/node" ]; then
  NODE_BIN="/usr/local/bin/node"
fi

if [ -z "$NODE_BIN" ]; then
  echo "❌ 未检测到 Node.js (>=20，推荐 v22+)，请先安装后重试。"
  exit 1
fi

echo "  • Node.js: $NODE_BIN"

PLUGINS_DST="$HOME/.gemini/config/plugins"
GRAVITY_DATA_DST="$HOME/.gemini/antigravity/plugin_data/gravity-hub"
GRAVITY_SIDECAR_DATA_DST="$HOME/.gemini/antigravity/sidecar_data/gravity-hub/dashboard"
mkdir -p "$PLUGINS_DST" "$GRAVITY_DATA_DST" "$GRAVITY_SIDECAR_DATA_DST"

# 0. 平滑迁移旧版 nebula-hub 与 aura-dashboard 的账号金库、时间线与偏好配置，并清理旧版插件目录
MIGRATED=0
for LEGACY_DIR in \
  "$HOME/.gemini/antigravity/plugin_data/nebula-hub" \
  "$HOME/.gemini/antigravity/sidecar_data/nebula-hub/dashboard" \
  "$HOME/.gemini/antigravity/plugin_data/aura-dashboard" \
  "$HOME/.gemini/antigravity/sidecar_data/aura-dashboard/dashboard"
do
  if [ -d "$LEGACY_DIR" ]; then
    for mf in accounts_vault.json account_timeline.json suite-auto-switch.json suite-last-route.json suite-update-state.json suite-account-prefs.json suite-auto-compact.json; do
      if [ -f "$LEGACY_DIR/$mf" ] && [ ! -f "$GRAVITY_DATA_DST/$mf" ]; then
        cp -p "$LEGACY_DIR/$mf" "$GRAVITY_DATA_DST/$mf"
        MIGRATED=1
      fi
      if [ -f "$LEGACY_DIR/$mf" ] && [ ! -f "$GRAVITY_SIDECAR_DATA_DST/$mf" ]; then
        cp -p "$LEGACY_DIR/$mf" "$GRAVITY_SIDECAR_DATA_DST/$mf"
      fi
    done
  fi
done
if [ "$MIGRATED" -eq 1 ]; then
  echo "  • 已从旧版插件无损迁移多账号金库与用户配置至引力中枢 (gravity-hub)"
fi

rm -rf \
  "$PLUGINS_DST/aura-dashboard" \
  "$PLUGINS_DST/nebula-hub" \
  "$PLUGINS_DST/workspace-file-tree" \
  "$PLUGINS_DST/file-launcher" \
  "/Applications/Antigravity Aura.app" \
  "/Applications/Antigravity Nebula.app"

# 1. 安装全自研纯 Node.js 三扩展（引力中枢 / 引力目录 / 引力文库）—— 原地同步以保留运行中 Sidecar 目录 inode
for p in gravity-hub gravity-explorer gravity-vault; do
  mkdir -p "$PLUGINS_DST/$p"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "$HERE/plugins/$p/" "$PLUGINS_DST/$p/"
  else
    cp -R "$HERE/plugins/$p/." "$PLUGINS_DST/$p/"
  fi
done

# 2. 同步 Google Gemini 四色流体流光主题、零遮挡遥测舱与双语汉化配置到全部数据目录
mkdir -p "$PLUGINS_DST/gravity-hub/sidecars/dashboard/user"
for f in config.json custom.css custom.js i18n.override.json; do
  cp "$HERE/plugin_data/gravity-hub/$f" "$GRAVITY_DATA_DST/$f"
  cp "$HERE/plugin_data/gravity-hub/$f" "$GRAVITY_SIDECAR_DATA_DST/$f"
  cp "$HERE/plugin_data/gravity-hub/$f" "$PLUGINS_DST/gravity-hub/sidecars/dashboard/user/$f"
done
if [ -f "$HERE/version.json" ]; then
  cp "$HERE/version.json" "$GRAVITY_DATA_DST/suite-version.json"
  cp "$HERE/version.json" "$GRAVITY_SIDECAR_DATA_DST/suite-version.json"
  cp "$HERE/version.json" "$PLUGINS_DST/gravity-hub/sidecars/dashboard/user/suite-version.json"
fi

# 3. 使用 Node.js 将当前 Mac 的 node 绝对路径写入全部 3 个扩展的 sidecar.json
"$NODE_BIN" -e '
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const nodeBin = process.argv[1];
const home = os.homedir();
const targets = [
  path.join(home, ".gemini/config/plugins/gravity-hub/sidecars/dashboard/sidecar.json"),
  path.join(home, ".gemini/config/plugins/gravity-explorer/sidecars/panel/sidecar.json"),
  path.join(home, ".gemini/config/plugins/gravity-vault/sidecars/dock/sidecar.json")
];
for (const p of targets) {
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  data.command = nodeBin;
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");
}
console.log("  • 已完成 3 个纯 Node.js 扩展的 macOS 启动路径适配");
' "$NODE_BIN"

# 4. 保护官方代码签名：不修改 app.asar（若存在旧版 .bak 则还原），创建无侵入启动器 Antigravity Gravity.app
ASAR_DIR="/Applications/Antigravity.app/Contents/Resources"
if [ -f "$ASAR_DIR/app.asar.bak" ]; then
  mv -f "$ASAR_DIR/app.asar.bak" "$ASAR_DIR/app.asar" && echo "  • 已还原官方纯净 app.asar（保障官方热更新签名完整）"
fi
LAUNCHER="/Applications/Antigravity Gravity.app"
rm -rf "$LAUNCHER"
mkdir -p "$LAUNCHER/Contents/MacOS" "$LAUNCHER/Contents/Resources"
if [ -f "$ASAR_DIR/icon.icns" ]; then
  cp "$ASAR_DIR/icon.icns" "$LAUNCHER/Contents/Resources/icon.icns"
fi
cat > "$LAUNCHER/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>zh_CN</string>
  <key>CFBundleDisplayName</key>
  <string>Antigravity Gravity</string>
  <key>CFBundleExecutable</key>
  <string>launch</string>
  <key>CFBundleIconFile</key>
  <string>icon.icns</string>
  <key>CFBundleIdentifier</key>
  <string>com.songh.antigravity-gravity-launcher</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Antigravity Gravity</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>2.2.3</string>
  <key>CFBundleVersion</key>
  <string>7</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
PLIST
cat > "$LAUNCHER/Contents/MacOS/launch" <<'SH'
#!/bin/sh
# Antigravity Gravity 引力套件无侵入 CDP 启动器（不修改 app.asar，100% 保护官方热更新签名）
LOG="/tmp/antigravity-gravity-launcher.log"
log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*" >> "$LOG" 2>/dev/null || true; }

APP="/Applications/Antigravity.app"
[ -d "$APP" ] || APP="$HOME/Applications/Antigravity.app"
LOCK_FILE="$HOME/Library/Application Support/Antigravity/SingletonLock"

RELAUNCH_PID=""
FORCE_RELAUNCH=0
for arg in "$@"; do
  case "$arg" in
    -psn_*) ;;
    --relaunch) FORCE_RELAUNCH=1 ;;
    --relaunch-pid=*) RELAUNCH_PID="${arg#--relaunch-pid=}"; FORCE_RELAUNCH=1 ;;
  esac
done

get_main_pid() {
  /bin/ps -axo pid=,command= 2>/dev/null | /usr/bin/awk -v bin="${APP}/Contents/MacOS/Antigravity" '{
    pid=$1
    sub(/^[[:space:]]*[0-9]+[[:space:]]+/, "")
    if ($0 == bin || index($0, bin " ") == 1) { print pid; exit }
  }'
}

CUR_PID="$(get_main_pid)"
log "Start: cur_pid=${CUR_PID:-none} relaunch_pid=${RELAUNCH_PID:-none} force=${FORCE_RELAUNCH}"

if [ -n "$CUR_PID" ] && [ "$FORCE_RELAUNCH" -eq 0 ]; then
  CUR_CMD="$(/bin/ps -p "$CUR_PID" -o command= 2>/dev/null || true)"
  case "$CUR_CMD" in
    *--remote-debugging-port*)
      log "Already running with CDP (pid=${CUR_PID}); focusing window"
      exec /usr/bin/open -a "$APP"
      ;;
  esac
fi

if [ -n "$CUR_PID" ] || [ -n "$RELAUNCH_PID" ]; then
  TARGET_PID="${RELAUNCH_PID:-$CUR_PID}"
  /usr/bin/osascript -e 'tell application "Antigravity" to quit' >/dev/null 2>&1 || true
  i=0
  while [ "$i" -lt 40 ]; do
    if [ -n "$TARGET_PID" ] && ! kill -0 "$TARGET_PID" 2>/dev/null; then break; fi
    if [ -z "$TARGET_PID" ] && [ -z "$(get_main_pid)" ]; then break; fi
    sleep 0.2
    i=$((i + 1))
  done
  if [ -n "$TARGET_PID" ] && kill -0 "$TARGET_PID" 2>/dev/null; then
    kill -TERM "$TARGET_PID" 2>/dev/null || true
    k=0
    while [ "$k" -lt 15 ]; do
      if ! kill -0 "$TARGET_PID" 2>/dev/null; then break; fi
      sleep 0.2
      k=$((k + 1))
    done
  fi
  j=0
  while [ "$j" -lt 20 ]; do
    [ ! -L "$LOCK_FILE" ] && [ ! -e "$LOCK_FILE" ] && break
    sleep 0.15
    j=$((j + 1))
  done
  sleep 0.8
fi

AFTER_PID="$(get_main_pid)"
if [ -n "$AFTER_PID" ] && [ "$AFTER_PID" != "$RELAUNCH_PID" ]; then
  exit 0
fi

log "Launching ${APP} with --remote-debugging-port=0"
exec /usr/bin/open -a "$APP" --args --remote-debugging-port=0
SH
chmod +x "$LAUNCHER/Contents/MacOS/launch"
codesign --force --sign - "$LAUNCHER" >/dev/null 2>&1 || true
echo "  • 已创建引力无侵入启动器：$LAUNCHER（不改动 Antigravity.app 官方签名）"

# 5. 如未安装官方 Antigravity CLI (agy)，自动安装并配置 PATH
if ! command -v agy >/dev/null 2>&1 && [ ! -x "$HOME/.local/bin/agy" ]; then
  echo "  • 正在安装官方 Antigravity CLI (agy)..."
  curl -fsSL https://antigravity.google/cli/install.sh | bash || true
fi
if [ -f "$HOME/.zshrc" ] && ! grep -q '\.local/bin' "$HOME/.zshrc" 2>/dev/null; then
  printf '\n# Antigravity CLI (agy)\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$HOME/.zshrc"
fi

echo "✅ 引力套件 (Gravity Suite v2.2.3) 安装完成！请完全退出 Antigravity (Cmd + Q) 并通过 Antigravity Gravity.app 重新打开。"
