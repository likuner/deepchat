#!/usr/bin/env bash
# ============================================================
# DeepChat 远程环境初始化脚本（幂等，可重复执行）
# 职责：安装系统依赖、Node 运行时、创建目录、安装
#       nginx 站点配置与 systemd 服务
# 在 Ubuntu 上以 sudo 执行
# ============================================================
set -euo pipefail

APP_DIR="/opt/deepchat"
NODE_VER="v20.18.1"
# 自动检测 CPU 架构，选择对应 Node 发行包
ARCH="$(uname -m)"
case "${ARCH}" in
    x86_64|amd64) NODE_ARCH="x64" ;;
    aarch64|arm64) NODE_ARCH="arm64" ;;
    *) echo "不支持的架构: ${ARCH}"; exit 1 ;;
esac
NODE_URL="https://nodejs.org/dist/${NODE_VER}/node-${NODE_VER}-linux-${NODE_ARCH}.tar.xz"
NODE_DIR="/opt/node20"

# 机器主 IP（用于证书 SAN 中的 IP 项）
SERVER_IP="$(hostname -I | awk '{print $1}')"

echo "==> [1/7] 安装系统依赖 (nginx / python3 / openssl / rsync / curl)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx python3 python3-venv python3-pip openssl rsync curl xz-utils

echo "==> [2/7] 安装 Node.js ${NODE_VER} (${NODE_ARCH})"
if ! "${NODE_DIR}/bin/node" --version >/dev/null 2>&1; then
    rm -rf "${NODE_DIR}"
    mkdir -p "${NODE_DIR}"
    echo "    下载 ${NODE_URL}"
    curl -fsSL "${NODE_URL}" -o /tmp/node.tar.xz
    tar -xJf /tmp/node.tar.xz -C "${NODE_DIR}" --strip-components=1
    rm -f /tmp/node.tar.xz
fi
NODE_BIN="${NODE_DIR}/bin/node"
"${NODE_BIN}" --version || { echo "Node 安装失败"; exit 1; }

echo "==> [3/7] 创建应用目录结构"
mkdir -p "${APP_DIR}"/{backend,frontend,scripts,config}
# 归 www-data 所有，后续 rsync 以 root 写入后运行服务
chown -R www-data:www-data "${APP_DIR}"

echo "==> [4/7] 生成 HTTPS 自签名证书"
mkdir -p /etc/nginx/ssl
if [ ! -f /etc/nginx/ssl/deepchat.crt ]; then
    openssl req -x509 -nodes -newkey rsa:2048 \
        -keyout /etc/nginx/ssl/deepchat.key \
        -out    /etc/nginx/ssl/deepchat.crt \
        -days 3650 \
        -subj "/C=CN/ST=Guangdong/L=Shenzhen/O=DeepChat/CN=deepchat.local" \
        -addext "subjectAltName=IP:${SERVER_IP},DNS:deepchat.local,DNS:localhost"
    echo "    证书已生成 (IP: ${SERVER_IP})"
else
    echo "    证书已存在，跳过"
fi
chmod 600 /etc/nginx/ssl/deepchat.key

echo "==> [5/7] 安装 nginx 站点配置（动静分离 + HTTPS）"
cp -f "${APP_DIR}/scripts/nginx.conf" /etc/nginx/sites-available/deepchat.conf
ln -sf /etc/nginx/sites-available/deepchat.conf /etc/nginx/sites-enabled/deepchat.conf
# 移除 nginx 默认站点，避免 80 端口冲突
rm -f /etc/nginx/sites-enabled/default

echo "==> [6/7] 安装 systemd 服务"
cp -f "${APP_DIR}/scripts/deepchat-backend.service"  /etc/systemd/system/deepchat-backend.service
cp -f "${APP_DIR}/scripts/deepchat-frontend.service" /etc/systemd/system/deepchat-frontend.service
systemctl daemon-reload
systemctl enable deepchat-backend.service deepchat-frontend.service nginx

echo "==> [7/7] 校验 nginx 配置"
nginx -t
systemctl restart nginx

echo "==> 初始化完成"
