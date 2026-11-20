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
mkdir -p "$PLUGINS_DST" "$AURA_DATA_DST"

# 1. 复制已定制好的 3 个扩展 (Aura 控制台 / 项目文件 / 文件启动器)
for p in aura-dashboard workspace-file-tree file-launcher; do
  rm -rf "$PLUGINS_DST/$p"
  cp -R "$HERE/plugins/$p" "$PLUGINS_DST/$p"
done

# 2. 复制 Google Gemini 四色流体流光主题与全量汉化配置（不覆盖已有账号保险库）
for f in config.json custom.css custom.js i18n.override.json; do
  cp "$HERE/plugin_data/aura-dashboard/$f" "$AURA_DATA_DST/$f"
done

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

# 4. 如未安装官方 Antigravity CLI (agy)，自动安装并配置 PATH
if ! command -v agy >/dev/null 2>&1 && [ ! -x "$HOME/.local/bin/agy" ]; then
  echo "  • 正在安装官方 Antigravity CLI (agy)..."
  curl -fsSL https://antigravity.google/cli/install.sh | bash || true
fi
if [ -f "$HOME/.zshrc" ] && ! grep -q '\.local/bin' "$HOME/.zshrc" 2>/dev/null; then
  printf '\n# Antigravity CLI (agy)\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$HOME/.zshrc"
fi

echo "✅ 安装完成！请完全退出 Antigravity (Cmd + Q) 并重新打开即可生效。"
