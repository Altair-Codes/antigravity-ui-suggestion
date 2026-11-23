#!/usr/bin/env bash
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
echo "🚀 正在安装 Antigravity Google Gemini 主题与全中文三扩展套件 (macOS)..."

NODE_BIN="$(command -v node || true)"
PYTHON_BIN="$(command -v python3 || true)"

if [ -z "$NODE_BIN" ] && [ -d "$HOME/.nvm/versions/node" ]; then
  NODE_BIN="$(find "$HOME/.nvm/versions/node" -maxdepth 3 -name node -type f | sort -V | tail -n 1)"
fi
if [ -z "$NODE_BIN" ] && [ -x "/opt/homebrew/bin/node" ]; then
  NODE_BIN="/opt/homebrew/bin/node"
fi
if [ -z "$NODE_BIN" ] && [ -x "/usr/local/bin/node" ]; then
  NODE_BIN="/usr/local/bin/node"
fi

if [ -z "$NODE_BIN" ] || [ -z "$PYTHON_BIN" ]; then
  echo "❌ 未检测到 Node.js (>=20) 或 Python 3，请先安装后重试。"
  exit 1
fi

echo "  • Node.js: $NODE_BIN"
echo "  • Python3: $PYTHON_BIN"

PLUGINS_DST="$HOME/.gemini/config/plugins"
AURA_DATA_DST="$HOME/.gemini/antigravity/plugin_data/aura-dashboard"
AURA_SIDECAR_DATA_DST="$HOME/.gemini/antigravity/sidecar_data/aura-dashboard/dashboard"
mkdir -p "$PLUGINS_DST" "$AURA_DATA_DST" "$AURA_SIDECAR_DATA_DST"

# 1. 复制已定制好的 3 个扩展 (Aura 控制台 / 项目文件 / 文件启动器)
for p in aura-dashboard workspace-file-tree file-launcher; do
  rm -rf "$PLUGINS_DST/$p"
  cp -R "$HERE/plugins/$p" "$PLUGINS_DST/$p"
done

# 2. 同步 Google Gemini 四色流体流光主题与全量汉化配置到全部数据目录（确保 100% 命中）
for f in config.json custom.css custom.js i18n.override.json; do
  cp "$HERE/plugin_data/aura-dashboard/$f" "$AURA_DATA_DST/$f"
  cp "$HERE/plugin_data/aura-dashboard/$f" "$AURA_SIDECAR_DATA_DST/$f"
  cp "$HERE/plugin_data/aura-dashboard/$f" "$PLUGINS_DST/aura-dashboard/sidecars/dashboard/user/$f"
done
if [ -f "$HERE/version.json" ]; then
  cp "$HERE/version.json" "$AURA_DATA_DST/suite-version.json"
  cp "$HERE/version.json" "$AURA_SIDECAR_DATA_DST/suite-version.json"
  cp "$HERE/version.json" "$PLUGINS_DST/aura-dashboard/sidecars/dashboard/user/suite-version.json"
fi

# 3. 自动将当前 Mac 的 node 与 python3 绝对路径写入 sidecar.json
"$PYTHON_BIN" - "$NODE_BIN" "$PYTHON_BIN" <<'PY'
import json, os, sys
node_bin, py_bin = sys.argv[1], sys.argv[2]
home = os.path.expanduser("~")
targets = [
    (f"{home}/.gemini/config/plugins/aura-dashboard/sidecars/dashboard/sidecar.json", node_bin),
    (f"{home}/.gemini/config/plugins/workspace-file-tree/sidecars/panel/sidecar.json", node_bin),
    (f"{home}/.gemini/config/plugins/file-launcher/sidecars/launcher_pane/sidecar.json", py_bin),
]
for p, cmd in targets:
    with open(p, "r", encoding="utf-8") as f:
        data = json.load(f)
    data["command"] = cmd
    with open(p, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
print("  • 已完成 3 个扩展的 macOS 启动路径自动适配")
PY

# 4. 保护官方代码签名：不修改 app.asar（若存在旧版 .bak 则还原），改用无侵入启动器传参开启 CDP
ASAR_DIR="/Applications/Antigravity.app/Contents/Resources"
if [ -f "$ASAR_DIR/app.asar.bak" ]; then
  mv -f "$ASAR_DIR/app.asar.bak" "$ASAR_DIR/app.asar" && echo "  • 已还原官方纯净 app.asar（保障官方热更新签名完整）"
fi
LAUNCHER="/Applications/Antigravity Aura.app"
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
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>Antigravity Aura</string>
  <key>CFBundleExecutable</key>
  <string>launch</string>
  <key>CFBundleIconFile</key>
  <string>icon.icns</string>
  <key>CFBundleIdentifier</key>
  <string>com.songh.antigravity-aura-launcher</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Antigravity Aura</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
PLIST
cat > "$LAUNCHER/Contents/MacOS/launch" <<'SH'
#!/bin/sh
# Antigravity Aura 无侵入 CDP 启动器（不修改 app.asar，完全保护官方热更新签名）
LOG="/tmp/antigravity-aura-launcher.log"
log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*" >> "$LOG" 2>/dev/null || true; }

APP="/Applications/Antigravity.app"
[ -d "$APP" ] || APP="$HOME/Applications/Antigravity.app"
PORT_FILE="$HOME/Library/Application Support/Antigravity/DevToolsActivePort"
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
  pgrep -f "^${APP}/Contents/MacOS/Antigravity($| )" 2>/dev/null | head -n 1
}

CUR_PID="$(get_main_pid)"
log "Start: cur_pid=${CUR_PID:-none} relaunch_pid=${RELAUNCH_PID:-none} force=${FORCE_RELAUNCH}"

if [ -n "$CUR_PID" ] && [ "$FORCE_RELAUNCH" -eq 0 ] && [ -f "$PORT_FILE" ]; then
  exec /usr/bin/open -a "$APP"
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
    sleep 1
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
echo "  • 已创建无侵入启动器：$LAUNCHER（不改动 Antigravity.app 官方签名）"

# 5. 如未安装官方 Antigravity CLI (agy)，自动安装并配置 PATH
if ! command -v agy >/dev/null 2>&1 && [ ! -x "$HOME/.local/bin/agy" ]; then
  echo "  • 正在安装官方 Antigravity CLI (agy)..."
  curl -fsSL https://antigravity.google/cli/install.sh | bash || true
fi
if [ -f "$HOME/.zshrc" ] && ! grep -q '\.local/bin' "$HOME/.zshrc" 2>/dev/null; then
  printf '\n# Antigravity CLI (agy)\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$HOME/.zshrc"
fi

echo "✅ 安装完成！请完全退出 Antigravity (Cmd + Q) 并重新打开即可生效。"
