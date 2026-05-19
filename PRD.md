这是一份完整的、可以直接交付给开发团队（Codex）的项目产品需求文档（PRD）。文档包含了业务逻辑、前后端功能、实时通信机制、大屏渲染、容器化部署以及 CI/CD 自动化流水线。

---

# 📄 产品需求文档 (PRD)

## 1. 项目概述 (Overview)

### 1.1 项目背景

本项目旨在面向全校 200 人以上的大型线下活动，通过低门槛、高趣味性的网页互动，向非技术专业师生传递“开源精神”（如：协同共创、Fork、PR、解决冲突、版本迭代）。

### 1.2 核心交付物

* **移动端 H5 (User Client):** 供现场观众手机扫码访问，免注册，即开即用。
* **大屏端 Web (Dashboard Client):** 供现场大屏幕/投影仪展示，实时接收并渲染所有用户行为。
* **后端服务 (Backend Service):** 处理高并发实时数据，进行内容审计、状态同步并分发。

---

## 2. 系统架构与数据流向 (Architecture)

整个系统采用 **“多端低延迟输入，单端高帧率输出”** 的实时架构。

```
[ 200+ 移动端 H5 ] ----( HTTP / WebSocket )----> [ Node.js 后端服务 ]
                                                        |
                                                 ( 过滤与广播 )
                                                        v
[ 现场大屏 Web ] <========( WebSocket 广播 )============+

```

---

## 3. 功能需求 (Functional Requirements)

### 3.1 核心模块一：【灵感开源墙】(Idea Forking Wall)

将开源中的 “分支（Branch）”、“拉取请求（PR）”和“星标（Star）”概念具象化为校园话题的创意接龙。

#### 3.1.1 移动端 H5 需求

* **主干话题浏览（Main Branch）：** 页面顶部平铺展示由管理员预设的 3-5 个校园痛点话题。
* **发起分支（Fork & PR）：** 用户可点击任意主话题，弹出输入框提交自己的解决方案（文本限制 50 字以内）。
* **点赞支持（Star）：** 用户可以浏览他人提交的方案分支，并点击“⭐ Star”进行点赞，每人对同一方案限点一次。

#### 3.1.2 大屏端 Web 需求

* **关系树状图（Tree Topology）：** 整个大屏以动态树状网络拓扑图呈现。中心节点为主干话题。
* **实时生长动画：** 移动端每提交一个方案，大屏对应的树枝上即时“长出”一个带有文字的气泡节点。
* **热度热力（Star Scaling）：** 节点的体积与收到的 Star 数量成正比。Star 增加时，节点产生轻微震动或发光动效。

---

### 3.2 核心模块二：【2D 像素共创墙】(Pixel Co-Creation)

通过协同绘制一幅像素画，传递开源社区中“协同作业”与“代码冲突（Conflict）”的概念。

#### 3.2.1 移动端 H5 需求

* **画布交互：** 提供一个 $100 \times 100$ 网格的 Canvas 画布，支持双指缩放（Pinch）与拖拽（Pan）。
* **贡献度限制（Rate Limit / Token Bucket）：** * 用户初始拥有 5 个“像素能量点”（即 Contribution 额度）。
* 在网格上涂色一次消耗 1 点。
* 能量每 60 秒自动恢复 1 点，上限为 5 点（防止单一用户恶意刷屏）。


* **冲突覆盖（Conflict Handling）：** 允许用户在已有颜色的网格上覆盖新颜色。发生覆盖时，H5 界面弹出轻量提示：*“你解决了一次代码冲突 (Conflict)！”*

#### 3.2.2 大屏端 Web 需求

* **全局画布同步：** 全屏高清晰度渲染 $100 \times 100$ 的像素矩阵。
* **落子特效：** 每次接收到新的落子数据，大屏对应坐标触发微型粒子炸裂或水波纹动效。
* **数据大盘：** 屏幕边缘实时滚动显示：当前在线贡献者数（Active Contributor）、累计提交总数（Total Commits）。

---

## 4. 非功能性需求 (Non-Functional Requirements)

### 4.1 性能与并发 (Performance)

* **并发承载：** 系统必须保证 **200 人同时在线**并高频交互时，服务端 CPU 使用率 $< 70\%$，不出现断连。
* **延迟要求：** 从移动端点击提交到大屏端渲染完成，端到端延迟 $\le 500\text{ ms}$。
* **帧率保证：** 大屏端 Canvas/WebGL 渲染在主流浏览器中需稳定在 $60\text{ fps}$。

### 4.2 安全与内容审计 (Content Security)

* **文本过滤：** 后端必须接入敏感词字典。凡涉及政治、暴力、违禁品及人身攻击的文本，一律拦截或替换为 `***`，并对该用户设备进行 5 分钟禁言。
* **接口防刷：** 限制单个 IP/设备 ID 的 WebSocket 连接数（上限 1 个），严格校验前端提交的能量消耗数据，防止抓包篡改。

---

## 5. 环境配置与部署规范 (Docker & CI/CD)

### 5.1 容器化规范 (Docker Compose)

项目须采用多容器架构进行解耦，在根目录下配置 `docker-compose.yml`：

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "80:80"
    depends_on:
      - backend

  redis:
    image: redis:alpine
    ports:
      - "6379:6379"

```

### 5.2 GitHub CI/CD 流水线 (GitHub Actions)

在 `.github/workflows/deploy.yml` 中定义自动化流水线，包含以下两个 Stage：

#### Stage 1: Continuous Integration (CI)

* **触发事件：** 任何向 `main` 或 `develop` 分支发起的 Pull Request。
* **自动化任务：**
1. 环境检查：Linter（ESLint）检查，确保无语法与风格死角。
2. 模拟构建：分别执行前、后端的 `npm run build`，确保编译无误。



#### Stage 2: Continuous Deployment (CD)

* **触发事件：** 代码成功合并（Merge）至 `main` 分支。
* **自动化任务：**
1. **镜像打包：** 自动构建 Docker 镜像，并打上 `latest` 及时间戳 Tag。
2. **推送仓库：** 自动推送到 GitHub Packages (GHCR)。
3. **远程部署（SSH）：** * 使用 GitHub Secrets 安全连接到社团云服务器。
* 在服务器执行脚本：拉取最新镜像 -> 停止旧容器 -> `docker-compose up -d --remove-orphans` 平滑重启。





---

## 6. 数据留存与分析 (Data Lifecycle)

* **数据落地：** 用户的每一条发言文本和每一个像素点坐标必须带有时间戳和匿名 ID，实时写入数据库/Redis。
* **开源导出：** 活动结束时，系统需提供一键导出功能：
* 导出所有创意文本为 `ideas.json`。
* 导出最终像素画布为 `canvas_output.png`。
* 这些文件后续将作为社团的开源资产向全校公开。