# DeepChat

基于 **Next.js + FastAPI + LangGraph** 的 AI 聊天应用，流式对话、Agent 工具调用、一键部署。

- 后端：FastAPI + uvicorn，LangGraph ReAct agent 编排，DeepSeek `deepseek-v4-flash` 流式接入
- 前端：Next.js 15（App Router）+ TailwindCSS，SSE 流式渲染
- 部署：nginx 动静分离 + HTTPS + systemd，本地一键脚本发布

## 功能特性

- ✅ **SSE 流式对话**：前端逐字渲染，无刷新体验
- ✅ **Agent 编排**：LangGraph StateGraph 手写 ReAct 循环（`agent ⇄ tools`）
- ✅ **Function Calling**：`get_current_time`（真实时间）、`get_city_weather`（城市天气）
- ✅ **循环熔断**：最大工具调用轮次 3（`DEEPSEEK_MAX_ITERATIONS` 可调），防止无限循环
- ✅ **Mock 降级**：未配置 API Key 时自动回退本地模拟回复
- ✅ **会话持久化**：SQLite 存储历史消息，刷新不丢
- ✅ **多轮上下文**：最近 20 条历史传给模型

## 架构

```text
浏览器
  │
  ▼
nginx :443 (动静分离, HTTPS)
  ├─ /api/*           → 动态 → FastAPI (uvicorn :8000, SSE 关闭缓冲, no-store)
  ├─ /_next/static/*  → 静态 → nginx 直读磁盘（immutable 长缓存 1y）
  └─ /*                → 页面 → Next.js SSR (:3000)

后端内部：LangGraph ReAct agent
  用户问题 → LLM 判断 → 需要工具则调用 get_current_time / get_city_weather → 结果回填 → LLM 继续 → 无工具调用即结束（≤3 轮）
```

## 本地开发

### 后端

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# 可选：配置 DeepSeek Key（不配则走 mock）
echo 'DEEPSEEK_API_KEY=sk-xxx' > .env
uvicorn app.main:app --reload --port 8000
```

API 文档：http://localhost:8000/docs

### 前端

```bash
cd frontend
npm install
npm run dev
```

访问 http://localhost:3000（前端默认同源请求 `/api`，本地开发可用 nginx 或代理转发到 8000）。

## 部署（CI/CD 一键脚本）

本地（macOS/Linux）执行：

```bash
./deploy/deploy.sh              # 增量部署：rsync 源码 + SSH 远程构建发布
./deploy/deploy.sh --skip-setup # 跳过环境初始化，快速发布
```

首次部署会自动在远程初始化：nginx、Python venv、Node 20（自动识别架构）、自签名 HTTPS 证书、systemd 服务。

脚本按序执行：

1. 检查 SSH 连通性
2. rsync 同步 `backend/`、`frontend/`、`deploy/remote/`（排除 `.venv`、`node_modules`、`.next`、`chat.db`、`.env`）
3. 单独同步 `backend/.env`（环境变量安全传递）
4. 远程执行 `deploy/remote/deploy.sh`：`pip install` → `next build` → 安装 systemd/nginx 配置 → 重启服务 → 健康检查

### 远程产物

| 路径 | 说明 |
|---|---|
| `/opt/deepchat/` | 应用目录（backend/frontend/scripts） |
| `/etc/nginx/sites-available/deepchat.conf` | nginx 站点配置（动静分离） |
| `/etc/nginx/ssl/deepchat.{crt,key}` | HTTPS 自签名证书（含 IP SAN） |
| `/etc/systemd/system/deepchat-{backend,frontend}.service` | 服务单元（www-data 运行，崩溃自愈） |
| `/var/log/nginx/deepchat.{access,error}.log` | nginx 日志 |
| `journalctl -u deepchat-backend -f` | 后端日志 |

## 环境变量

后端通过 `backend/.env` 加载（模板见 `backend/.env.example`），部署时自动同步到远程：

| 变量 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `DEEPSEEK_API_KEY` | 是* | — | DeepSeek 开放平台 Key（https://platform.deepseek.com/）；缺失时回退 mock |
| `DEEPSEEK_BASE_URL` | 否 | `https://api.deepseek.com` | OpenAI 兼容接口地址 |
| `DEEPSEEK_MODEL` | 否 | `deepseek-v4-flash` | 模型名（V4 系列） |
| `DEEPSEEK_SYSTEM_PROMPT` | 否 | 内置 | 系统提示词，定义助手身份与行为 |
| `DEEPSEEK_MAX_HISTORY` | 否 | `20` | 传给模型的最大历史消息条数 |
| `DEEPSEEK_MAX_MESSAGE_CHARS` | 否 | `8000` | 单条消息最大字符数 |
| `DEEPSEEK_MAX_ITERATIONS` | 否 | `3` | Agent 最大工具调用轮次（防无限循环） |

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/health` | 健康检查 |
| `GET` | `/api/sessions` | 会话列表 |
| `POST` | `/api/sessions` | 创建会话 |
| `GET` | `/api/sessions/{id}` | 会话详情（含消息） |
| `DELETE` | `/api/sessions/{id}` | 删除会话 |
| `POST` | `/api/chat/stream` | SSE 流式对话（`session_id` + `message`） |

## 技术要点

- **LangGraph 版本坑**：`langgraph>=0.3` 的 `create_react_agent` 已弃用且不再支持 `max_iterations`，本项目用 `StateGraph` 手写 ReAct + `iteration` 计数器精确熔断，`GraphRecursionError` 兜底。
- **SSE 经 nginx**：`proxy_buffering off` + `X-Accel-Buffering: no`，避免流式响应被缓冲。
- **身份锚定**：通过 `SYSTEM_PROMPT` 明确模型身份，避免模型从训练语料臆测（如自报其他模型）。
