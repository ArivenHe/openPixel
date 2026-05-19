# OpenPixel

一个面向线下活动的实时互动项目，包含：

- 移动端 H5：创意接龙、Star 点赞、代码补全
- 大屏端 Web：创意树、实时代码共创墙、活动数据大盘
- 后端服务：Socket.IO 实时通信、敏感词审计、贡献度限流、Redis 持久化、导出接口

## 技术栈

- Frontend：React + Vite + Canvas
- Backend：Node.js + Express + Socket.IO
- Storage：Redis（本地无 Redis 时自动降级为文件持久化模式）
- Deployment：Docker Compose + GitHub Actions

## 本地启动

```bash
npm run install:all

# 终端 1
cd backend
npm run dev

# 终端 2
cd frontend
npm run dev
```

访问：

- 移动端首页：`http://localhost:5173/mobile`
- 学号登记：`http://localhost:5173/mobile/register`
- 灵感墙：`http://localhost:5173/mobile/ideas`
- 代码补全墙：`http://localhost:5173/mobile/code`
- 盲盒知识共享：`http://localhost:5173/mobile/blind-box`
- 奖励中心：`http://localhost:5173/mobile/rewards`
- 大屏端：`http://localhost:5173/dashboard`
- 管理台：`http://localhost:5173/admin`
- 抽奖操作页：`http://localhost:5173/draw`
- 抽奖展示大屏：`http://localhost:5173/lottery`

如果你本地装了 Redis，可设置：

```bash
export REDIS_URL=redis://127.0.0.1:6380
```

否则后端会自动使用本地文件持久化模式，方便直接演示。

后台、抽奖操作页与抽奖展示大屏都需要管理员 token。开发环境请在：

```bash
backend/.env
```

中配置：

```bash
ADMIN_TOKEN=your-long-random-token
```

仓库里已提供 [backend/.env.example](/Users/ariven/1-jmiopenatom/openPixel/backend/.env.example) 作为模板。

后台、抽奖操作页和抽奖展示大屏在连续输错 3 次 token 后，会按来源 IP 临时封禁；默认统计窗口和封禁时长都是 10 分钟，封禁状态会跟随 Redis / 本地文件一并持久化。

## Docker 启动

```bash
docker compose up --build
```

访问：

- 移动端：`http://localhost:8088/mobile`
- 大屏端：`http://localhost:8088/dashboard`

Docker 部署时只暴露前端 nginx 端口，后端接口通过同域 `/api` 与 `/socket.io` 由 nginx 转发到 Docker 内网中的后端服务；Redis 也只在 Docker 内网中使用。

生产部署使用：

```bash
export BACKEND_IMAGE=ghcr.io/<owner>/<repo>/backend:latest
export FRONTEND_IMAGE=ghcr.io/<owner>/<repo>/frontend:latest
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --remove-orphans
```

### GitHub Actions SSH 自动部署

仓库内置 `.github/workflows/deploy.yml`，会在 PR 到 `main` 时执行前后端 lint / build，在 push 到 `main` 后通过 SSH 登录服务器并执行：

```bash
git fetch --all --prune
git reset --hard origin/main
docker compose down --remove-orphans
docker compose up -d --build
```

需要在 GitHub 的 `SERVER` environment 或 Actions secrets 中配置：

| Secret | 说明 |
| --- | --- |
| `SERVER_HOST` | 服务器 IP 或域名 |
| `SERVER_USER` | SSH 用户名 |
| `SERVER_PORT` | SSH 端口，默认可填 `22` |
| `SERVER_PASSWORD` | SSH 密码 |
| `SERVER_DEPLOY_PATH` | 服务器上的项目目录，默认脚本使用 `/www/wwwroot/openPixel` |
| `ADMIN_TOKEN` | 管理台 / 抽奖页 token |

首次部署前，服务器目录需要已经 clone 好本仓库，并安装 Docker 与 Docker Compose。

## 快速验收

后端启动后可执行：

```bash
cd backend
npm run smoke
```

它会验证一条完整链路：

1. 学号登记
2. 创建创意分支并获得 1 分
3. Star 点赞
4. 完成 5 次代码补全并获得 1 分
5. 完成盲盒知识共享并获得 1 分
6. 获得抽奖资格并完成一次抽奖

如果你在正式活动前需要清空本地演示数据：

```bash
cd backend
npm run reset:local
```

## 主要能力

### 灵感开源墙

- 管理台可新增 / 修改灵感墙主干话题
- 已有 Fork 的话题只能改名，不能直接删除，避免历史内容丢失归属
- 50 字以内创意分支提交
- 每设备对同一创意只能 Star 一次
- 大屏实时生成树状节点，节点大小随 Star 数变化

### 代码补全墙

- 40 道多语言低门槛代码任务，当前支持 JavaScript、Python、Java、Go
- 任务覆盖 PR、Fork、Review、CI、Conflict 等开源概念
- 用户选择正确补全项，测试通过后生成一次 Commit
- 每个学号对同一任务只能成功提交一次
- 移动端任务顺序由后端随机洗牌，支持按语言筛选；大屏实时展示仓库任务状态和最新 Commit 流

### 积分、奖励与抽奖

- PR 提交 1 次 = 1 分
- 代码补全每成功 Commit 5 次 = 1 分
- 首次完成盲盒知识共享 = 1 分
- 管理台可新增 / 修改 / 删除奖品，并实时调整库存、所需积分和是否加入随机奖池
- 贴纸、徽章、终极大奖、MVP 与自定义奖品都会持久化；已中奖或已核销的奖品会自动禁止删除
- 满足奖品所需积分后，可由工作人员在抽奖操作页指定学号开奖
- 独立抽奖操作页负责指定学号开奖
- 独立抽奖展示大屏负责实时展示结果，开奖历史持久化
- MVP 奖自动按 Star 数最高的创意方案计算

### 内容安全与导出

- 敏感词审计与 5 分钟禁言
- 服务端校验能量消耗
- Redis 实时记录创意与代码提交事件
- 未配置 Redis 时，自动使用 `backend/runtime/state.json` 做本地文件持久化
- 导出：
  - `GET /api/export/ideas`
  - `GET /api/export/code-submissions`
  - `GET /api/export/participants`
  - `GET /api/export/blind-box-shares`
  - `GET /api/export/lottery`

## 可配置环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 后端端口 |
| `REDIS_URL` | 空 | Redis 连接地址 |
| `MUTE_DURATION_MS` | `300000` | 敏感词命中后的禁言时长 |
| `TOKEN_CAPACITY` | `5` | 兼容旧像素模块的能量上限 |
| `TOKEN_REFILL_MS` | `60000` | 兼容旧像素模块的能量恢复间隔 |
| `CLIENT_ORIGIN` | `*` | CORS 来源 |
| `ADMIN_TOKEN` | 空 | 管理台 / 抽奖操作页 / 抽奖展示大屏管理员口令，生产环境建议设置 |
| `ADMIN_AUTH_MAX_FAILURES` | `3` | 管理 token 连续失败上限 |
| `ADMIN_AUTH_FAILURE_WINDOW_MS` | `600000` | 连续失败统计窗口 |
| `ADMIN_AUTH_BAN_DURATION_MS` | `600000` | 达到失败上限后的封禁时长 |

## CI/CD

`.github/workflows/deploy.yml` 包含：

1. PR 到 `main` / `develop` 的 lint + build
2. 合并到 `main` 后构建 GHCR 镜像并通过 SSH 远程部署
