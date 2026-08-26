#!/usr/bin/env bash
# ============================================================
# DeepChat 远程构建部署脚本（幂等）
# 前置：源码已由本地 rsync 同步到 /opt/deepchat/{backend,frontend}
# 职责：安装 Python 依赖、构建前端、更新配置、重启服务
# 以 sudo 执行
# ============================================================
set -euo pipefail

APP_DIR="/opt/deepchat"
NODE_BIN="/opt/node20/bin/node"

echo "==> [1/4] 构建后端"
cd "${APP_DIR}/backend"
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi
.venv/bin/pip install --upgrade pip -q
.venv/bin/pip install -r requirements.txt -q
echo "    后端依赖就绪"

echo "==> [2/4] 构建前端"
cd "${APP_DIR}/frontend"
if [ -f package-lock.json ]; then
    PATH="/opt/node20/bin:$PATH" npm ci --no-audit --no-fund
else
    PATH="/opt/node20/bin:$PATH" npm install --no-audit --no-fund
fi
PATH="/opt/node20/bin:$PATH" npm run build
echo "    前端构建完成"

echo "==> [3/4] 同步配置、生成证书并修复权限"
cp -f "${APP_DIR}/scripts/nginx.conf"            /etc/nginx/sites-available/deepchat.conf
cp -f "${APP_DIR}/scripts/deepchat-backend.service"  /etc/systemd/system/deepchat-backend.service
cp -f "${APP_DIR}/scripts/deepchat-frontend.service" /etc/systemd/system/deepchat-frontend.service
# HTTPS 自签名证书（幂等；支持 --skip-setup 场景）
SERVER_IP="$(hostname -I | awk '{print $1}')"
mkdir -p /etc/nginx/ssl
if [ ! -f /etc/nginx/ssl/deepchat.crt ]; then
    openssl req -x509 -nodes -newkey rsa:2048 \
        -keyout /etc/nginx/ssl/deepchat.key \
        -out    /etc/nginx/ssl/deepchat.crt \
        -days 3650 \
        -subj "/C=CN/ST=Guangdong/L=Shenzhen/O=DeepChat/CN=deepchat.local" \
        -addext "subjectAltName=IP:${SERVER_IP},DNS:deepchat.local,DNS:localhost"
    echo "    证书已生成 (IP: ${SERVER_IP})"
fi
chmod 600 /etc/nginx/ssl/deepchat.key
# 确保 .env 存在（systemd EnvironmentFile 引用），缺失时创建空文件
touch "${APP_DIR}/backend/.env"
# 确保 SQLite 数据库与构建产物可被 www-data 读写
chown -R www-data:www-data "${APP_DIR}/backend" "${APP_DIR}/frontend"

echo "==> [4/4] 重启服务"
systemctl daemon-reload
nginx -t
systemctl restart nginx deepchat-backend.service deepchat-frontend.service

# 健康检查
sleep 2
echo "---- 服务状态 ----"
systemctl is-active deepchat-backend.service || echo "后端未启动，请查看: journalctl -u deepchat-backend -n 50"
systemctl is-active deepchat-frontend.service || echo "前端未启动，请查看: journalctl -u deepchat-frontend -n 50"
curl -fsS http://127.0.0.1:8000/api/health && echo " <- 后端 API 健康检查 OK" || echo "后端健康检查失败"
curl -fsS -o /dev/null -w "前端页面 HTTP %{http_code}\n" http://127.0.0.1:3000/ || echo "前端页面检查失败"
curl -kfsS -o /dev/null -w "nginx HTTPS 入口 HTTP %{http_code}\n" https://127.0.0.1/ || echo "nginx 入口检查失败"
REDIRECT_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/)
[ "${REDIRECT_CODE}" = "301" ] && echo "HTTP 80 -> HTTPS 301 重定向 OK" || echo "HTTP 重定向异常: ${REDIRECT_CODE}"

echo "==> 部署完成"
