#!/usr/bin/env bash
# ============================================================
# DeepChat 一键部署脚本（本地执行，macOS/Linux）
#
# 用法:
#   ./deploy/deploy.sh             # 完整部署（首次自动初始化环境）
#   ./deploy/deploy.sh --skip-setup # 跳过环境初始化，仅重新构建发布
#   ./deploy/deploy.sh --setup-only # 仅初始化远程环境，不构建发布
#
# 流程: 本地 rsync 源码 → 远程 setup.sh(环境) → 远程 deploy.sh(构建发布)
# ============================================================
set -euo pipefail

# ---------- 可配置参数 ----------
REMOTE_HOST="${REMOTE_HOST:-192.168.13.130}"
REMOTE_USER="${REMOTE_USER:-likun}"
APP_DIR="/opt/deepchat"
LOCAL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10)

# ---------- 解析参数 ----------
MODE="all"   # all | setup-only | deploy-only
for arg in "$@"; do
    case "$arg" in
        --setup-only) MODE="setup-only" ;;
        --skip-setup) MODE="deploy-only" ;;
    esac
done

log() { echo -e "\n\033[1;36m====> $*\033[0m"; }

# ---------- 1. 连通性检查 ----------
log "检查 SSH 连通性 ${REMOTE_USER}@${REMOTE_HOST}"
ssh "${SSH_OPTS[@]}" "${REMOTE_USER}@${REMOTE_HOST}" 'echo SSH OK; whoami' || {
    echo "SSH 连接失败，请检查网络/用户名/密钥。"; exit 1;
}

# ---------- 2. 预创建远程目录 ----------
log "准备远程目录 ${APP_DIR}"
ssh "${SSH_OPTS[@]}" "${REMOTE_USER}@${REMOTE_HOST}" \
    "sudo mkdir -p ${APP_DIR}/{backend,frontend,scripts,config} && sudo chown -R www-data:www-data ${APP_DIR}"

# ---------- 3. 同步源码（排除构建产物与本地数据） ----------
log "同步 backend 源码"
rsync -az --delete \
    --rsync-path="sudo rsync" \
    -e "ssh ${SSH_OPTS[*]}" \
    --exclude='.venv' --exclude='__pycache__' --exclude='*.pyc' \
    --exclude='chat.db' --exclude='.env' \
    "${LOCAL_ROOT}/backend/" "${REMOTE_USER}@${REMOTE_HOST}:${APP_DIR}/backend/"

# 若本地存在 backend/.env（DeepSeek API Key 等），单独同步到远程且不删除远程同名文件
if [ -f "${LOCAL_ROOT}/backend/.env" ]; then
    log "同步 backend/.env（环境变量）"
    rsync -az --rsync-path="sudo rsync" -e "ssh ${SSH_OPTS[*]}" \
        "${LOCAL_ROOT}/backend/.env" "${REMOTE_USER}@${REMOTE_HOST}:${APP_DIR}/backend/.env"
fi

log "同步 frontend 源码"
rsync -az --delete \
    --rsync-path="sudo rsync" \
    -e "ssh ${SSH_OPTS[*]}" \
    --exclude='node_modules' --exclude='.next' --exclude='.git' \
    "${LOCAL_ROOT}/frontend/" "${REMOTE_USER}@${REMOTE_HOST}:${APP_DIR}/frontend/"

# ---------- 4. 同步部署脚本与配置 ----------
log "同步部署脚本与配置文件"
rsync -az --rsync-path="sudo rsync" -e "ssh ${SSH_OPTS[*]}" \
    "${LOCAL_ROOT}/deploy/remote/" "${REMOTE_USER}@${REMOTE_HOST}:${APP_DIR}/scripts/"

# ---------- 5. 远程执行 ----------
NEED_SETUP=$(ssh "${SSH_OPTS[@]}" "${REMOTE_USER}@${REMOTE_HOST}" \
    'test -f /etc/systemd/system/deepchat-backend.service && echo no || echo yes')

if [ "$MODE" = "setup-only" ] || { [ "$MODE" = "all" ] && [ "$NEED_SETUP" = "yes" ]; }; then
    log "初始化远程环境 (setup.sh)"
    ssh "${SSH_OPTS[@]}" "${REMOTE_USER}@${REMOTE_HOST}" \
        "sudo bash ${APP_DIR}/scripts/setup.sh"
elif [ "$MODE" = "all" ] && [ "$NEED_SETUP" = "no" ]; then
    log "远程环境已初始化，跳过 setup.sh"
fi

if [ "$MODE" = "deploy-only" ] || [ "$MODE" = "all" ]; then
    log "远程构建并发布 (deploy.sh)"
    ssh "${SSH_OPTS[@]}" "${REMOTE_USER}@${REMOTE_HOST}" \
        "sudo bash ${APP_DIR}/scripts/deploy.sh"
fi

log "部署完成: https://${REMOTE_HOST}/  (HTTP 80 自动重定向 HTTPS，自签名证书首次访问需手动信任)"
