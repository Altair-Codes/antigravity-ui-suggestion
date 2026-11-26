#!/usr/bin/env bash
set -euo pipefail

AUTO_YES=0
DRY_RUN=0
NO_RELAUNCH=0

for arg in "$@"; do
  case "$arg" in
    --yes|-y) AUTO_YES=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --no-relaunch) NO_RELAUNCH=1 ;;
    --help|-h)
      cat <<'EOF'
用法: ./uninstall-mac.sh [--yes|-y] [--dry-run] [--no-relaunch]
  --yes, -y       跳过交互确认直接执行卸载
  --dry-run       仅预览将被清理的扩展、配置与启动器路径，不实际删除
  --no-relaunch   清理后不自动重启官方原生 Antigravity
EOF
      exit 0
      ;;
    *)
      echo "未知参数: $arg" >&2
      exit 1
      ;;
  esac
done

SUITE_NAMES=(
  "gravity-hub"
  "gravity-explorer"
  "gravity-vault"
  "aura-dashboard"
  "nebula-hub"
  "workspace-file-tree"
  "file-launcher"
)

PLUGINS_ROOT="$HOME/.gemini/config/plugins"
PLUGIN_DATA_ROOT="$HOME/.gemini/antigravity/plugin_data"
SIDECAR_DATA_ROOT="$HOME/.gemini/antigravity/sidecar_data"

REMOVE_TARGETS=()
RESTORE_ASAR_TARGETS=()

add_remove_if_exists() {
  local p="$1"
  if [ -e "$p" ] || [ -L "$p" ]; then
    REMOVE_TARGETS+=("$p")
  fi
}

for name in "${SUITE_NAMES[@]}"; do
  add_remove_if_exists "$PLUGINS_ROOT/$name"
  add_remove_if_exists "$PLUGIN_DATA_ROOT/$name"
  add_remove_if_exists "$SIDECAR_DATA_ROOT/$name"
done

add_remove_if_exists "$SIDECAR_DATA_ROOT/gravity-suite-boot.log"
add_remove_if_exists "/Applications/Antigravity Gravity.app"
add_remove_if_exists "$HOME/Applications/Antigravity Gravity.app"
add_remove_if_exists "/Applications/Antigravity Nebula.app"
add_remove_if_exists "/Applications/Antigravity Aura.app"
add_remove_if_exists "/tmp/antigravity-gravity-launcher.log"

for res_dir in \
  "/Applications/Antigravity.app/Contents/Resources" \
  "$HOME/Applications/Antigravity.app/Contents/Resources"
do
  if [ -f "$res_dir/app.asar.bak" ]; then
    RESTORE_ASAR_TARGETS+=("$res_dir/app.asar.bak")
  fi
  add_remove_if_exists "$res_dir/app.asar.cdp_pending"
done

echo "🧹 Antigravity 引力套件彻底卸载向导 (macOS)"
echo "------------------------------------------------"
if [ "${#REMOVE_TARGETS[@]}" -eq 0 ] && [ "${#RESTORE_ASAR_TARGETS[@]}" -eq 0 ]; then
  echo "✅ 未检测到任何引力套件残留文件，当前已是纯净原生 Antigravity 环境。"
  exit 0
fi

echo "以下引力套件扩展、配置与启动器将被清除："
for p in ${REMOVE_TARGETS[@]+"${REMOVE_TARGETS[@]}"}; do
  echo "  • [删除] $p"
done
for bak in ${RESTORE_ASAR_TARGETS[@]+"${RESTORE_ASAR_TARGETS[@]}"}; do
  echo "  • [还原] $bak -> ${bak%.bak}"
done
echo ""
echo "✅ 以下官方原生数据将完整保留，绝不触碰："
echo "  • 官方 Antigravity.app 本体与代码签名"
echo "  • 历史对话记录 (~/.gemini/antigravity/conversations/)"
echo "  • 官方账号登录状态与无关第三方扩展 (如 swarm)"
echo ""

if [ "$DRY_RUN" -eq 1 ]; then
  echo "🔍 [dry-run] 预览结束，未修改任何文件。"
  exit 0
fi

if [ "$AUTO_YES" -ne 1 ]; then
  if [ ! -t 0 ]; then
    echo "❌ 非交互终端下未传入 --yes，已安全中止（可附加 --yes 或 --dry-run）。" >&2
    exit 1
  fi
  printf "确认彻底清除以上引力套件产物并还原原生 Antigravity？[y/N] "
  read -r REPLY
  case "$REPLY" in
    [yY]|[yY][eE][sS]) ;;
    *)
      echo "已取消卸载。"
      exit 0
      ;;
  esac
fi

for p in ${REMOVE_TARGETS[@]+"${REMOVE_TARGETS[@]}"}; do
  rm -rf -- "$p"
  echo "  ✓ 已删除: $p"
done

for bak in ${RESTORE_ASAR_TARGETS[@]+"${RESTORE_ASAR_TARGETS[@]}"}; do
  target="${bak%.bak}"
  mv -f -- "$bak" "$target"
  echo "  ✓ 已还原官方 app.asar: $target"
done

APP_PATH=""
if [ -d "/Applications/Antigravity.app" ]; then
  APP_PATH="/Applications/Antigravity.app"
elif [ -d "$HOME/Applications/Antigravity.app" ]; then
  APP_PATH="$HOME/Applications/Antigravity.app"
fi

if [ "$NO_RELAUNCH" -eq 0 ] && [ -n "$APP_PATH" ] && pgrep -x "Antigravity" >/dev/null 2>&1; then
  echo "🔄 正在关闭当前带扩展状态的 Antigravity 并以官方原生模式重启..."
  osascript -e 'tell application "Antigravity" to quit' >/dev/null 2>&1 || true
  i=0
  while [ "$i" -lt 40 ]; do
    if ! pgrep -x "Antigravity" >/dev/null 2>&1; then break; fi
    sleep 0.2
    i=$((i + 1))
  done
  if pgrep -x "Antigravity" >/dev/null 2>&1; then
    pkill -TERM -x "Antigravity" >/dev/null 2>&1 || true
    sleep 1
  fi
  LOCK_FILE="$HOME/Library/Application Support/Antigravity/SingletonLock"
  j=0
  while [ "$j" -lt 20 ]; do
    [ ! -L "$LOCK_FILE" ] && [ ! -e "$LOCK_FILE" ] && break
    sleep 0.15
    j=$((j + 1))
  done
  sleep 0.6
  open -a "$APP_PATH"
  echo "✅ 已以官方原生模式重启 Antigravity！"
else
  echo "✅ 彻底清除完成！请通过官方 Antigravity.app 打开即可享受纯净原生体验。"
fi
