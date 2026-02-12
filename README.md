# AICS - 智能AI客服系统

AICS (AI Customer Service) 是一个功能完整的智能客服管理系统，支持多语言界面、外部邮件集成、意图识别、知识库 RAG 检索、AI Agent 自动处理（含工具 Function Calling）、安全管控以及人工客服转接。

## 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | Next.js 15, React 19, TypeScript, Tailwind CSS 4, TanStack Query, Zustand, next-intl, Recharts |
| **后端** | NestJS 10, TypeScript, Prisma 6, BullMQ, Passport JWT |
| **数据库** | PostgreSQL 16 + pgvector |
| **缓存/队列** | Redis 7 |
| **AI** | OpenAI 兼容 API（支持 DeepSeek 等第三方模型） |
| **国际化** | next-intl（中文 / English / Bahasa Indonesia） |

## 项目结构

```
├── apps/
│   ├── web/               # Next.js 前端
│   │   ├── messages/      # i18n 多语言翻译文件 (zh-CN, en, id)
│   │   └── src/
│   │       ├── app/       # App Router 页面
│   │       ├── components/# UI 组件库
│   │       ├── i18n/      # 国际化配置
│   │       └── lib/       # 工具函数、API 客户端
│   └── server/            # NestJS 后端
│       ├── prisma/        # 数据库 Schema & 迁移 & 种子数据
│       └── src/
│           └── modules/   # 按功能模块组织
├── packages/
│   └── shared/            # 共享类型、枚举、国际化工具
├── docker-compose.yml     # 容器编排
└── pnpm-workspace.yaml    # pnpm monorepo 配置
```

## 核心功能

### 外部集成
- 邮件 IMAP/SMTP 收发（支持 Gmail、163、Outlook 等）
- API 接入（预留扩展）
- 手动创建消息
- 模拟邮件发送（开发测试用）

### 知识中心
- 知识库管理（多知识库、自定义分类树）
- 文档上传解析（PDF / DOCX / XLSX / TXT / HTML）
- 富文本知识在线创建与编辑
- 文档在线预览与内容查看
- RAG 向量检索 + 关键词检索（CJK 优化分词）
- 知识分块可视化

### 意图识别
- LLM 驱动的意图分类
- 预设意图 + 自定义意图
- 意图-Agent 绑定
- 意图置信度阈值配置
- 在线测试意图识别

### 变量管理
- 三层提取机制（自动同步、关键词匹配、LLM 智能提取）
- 系统变量 + 自定义变量
- 列表型变量支持
- 变量在工具参数和 Agent 提示词中的引用

### 工具管理
- HTTP API 工具配置（GET / POST / PUT / DELETE / PATCH）
- 多种认证方式（Bearer Token / API Key / Basic Auth）
- 参数定义与变量绑定
- 响应映射回写变量（JSONPath 支持）
- 在线工具测试
- 执行日志与监控

### 智能体 (Agent)
- **对话型 Agent** — 系统提示词 + 知识库 RAG + 工具 Function Calling
- **工作流型 Agent** — 可视化步骤编排（LLM 调用、条件判断、变量设置、子 Agent、HTTP 请求、工具调用）
- LLM 自动工具调用循环（最多 10 轮迭代）
- 多知识库 / 多工具绑定
- 温度、Token 上限、Top-P 等参数可调
- Agent 复制与启用/禁用

### AI 安全管控
- 关键词 / 正则表达式 / LLM 三种安全检查方式
- 自定义安全规则（增删改查）
- 内置规则保护（仅允许调整严重程度）
- 多级严重程度（低 / 中 / 高 / 严重）
- 动作策略（警告 / 拦截 / 转人工）
- 安全日志审计
- 告警通知配置

### 工单管理
- 完整工单生命周期（新建 → 处理中 → 等待 → 已关闭）
- 工单指派、回复、跟进
- 内联处理日志查看（流水线各阶段状态、意图、Agent、错误详情）
- 失败阶段重试
- 模拟邮件测试入口

### 处理流水线
- 5 阶段自动化流水线：**收录 → 意图识别 → 变量提取 → Agent 处理 → 安全审核**
- 安全通过后自动回复 / 不通过转人工
- 流水线配置集成在系统设置中（自动回复开关、最大重试次数）

### 数据分析
- 概览仪表盘（工单总量、处理率、平均响应时间）
- 工单量趋势图
- 意图分布统计

### 国际化
- 支持三种语言：简体中文 (zh-CN)、英语 (en)、印尼语 (id)
- 前端界面一键切换语言
- 基于 Cookie 的语言偏好持久化

## 快速开始

### 前提条件

- Node.js >= 20
- pnpm >= 9
- Docker & Docker Compose

### 1. 克隆项目

```bash
git clone <repo-url>
cd AICS
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置以下关键项：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接串 | `postgresql://postgres:password@localhost:5432/aics` |
| `REDIS_HOST` | Redis 地址 | `localhost` |
| `REDIS_PORT` | Redis 端口 | `6379` |
| `JWT_SECRET` | JWT 密钥 | 请修改为安全随机字符串 |
| `JWT_EXPIRES_IN` | JWT 过期时间 | `7d` |
| `LLM_API_KEY` | LLM API 密钥 | 需要配置 |
| `LLM_BASE_URL` | LLM API 地址 | `https://api.openai.com/v1` |
| `LLM_MODEL` | 对话模型 | `gpt-4` |
| `LLM_EMBEDDING_MODEL` | 向量模型 | `text-embedding-ada-002` |
| `TOOL_AUTH_ENCRYPTION_KEY` | 工具认证加密密钥 | 请生成 32 字节随机 hex 字符串 |
| `UPLOAD_DIR` | 文件上传目录 | `./uploads` |
| `EMAIL_POLL_INTERVAL_MS` | 邮件轮询间隔（毫秒） | `60000` |
| `NEXT_PUBLIC_API_URL` | 前端 API 地址 | `http://localhost:3001/api` |

### 4. 启动基础服务

```bash
docker compose up -d postgres redis
```

### 5. 初始化数据库

```bash
# 生成 Prisma 客户端
pnpm db:generate

# 运行数据库迁移
pnpm db:migrate

# 导入初始数据（管理员账号、预设意图、变量、安全规则等）
pnpm db:seed
```

### 6. 启动开发服务

```bash
# 同时启动前后端
pnpm dev

# 或分开启动
pnpm dev:server   # 后端 http://localhost:3001
pnpm dev:web      # 前端 http://localhost:3000
```

### 7. 登录

打开 `http://localhost:3000`，使用初始管理员账号登录：

- **邮箱**: `admin@aics.com`
- **密码**: `admin123`

## Docker 部署

一键启动所有服务：

```bash
docker compose up -d
```

这将启动：
- PostgreSQL (pgvector) — 端口 5432
- Redis — 端口 6379
- 后端服务 (NestJS) — 端口 3001
- 前端服务 (Next.js) — 端口 3000

后端服务启动时会自动运行 Prisma 迁移。

## 系统页面

| 页面 | 路径 | 说明 |
|------|------|------|
| 仪表盘 | `/dashboard` | 数据概览、趋势图、意图分布 |
| 外部集成 | `/integrations` | 邮箱账号管理、API 接入 |
| 知识中心 | `/knowledge` | 知识库、文档管理、在线预览编辑 |
| 意图管理 | `/intents` | 意图配置、测试、Agent 绑定 |
| 变量管理 | `/variables` | 系统变量、自定义变量、提取规则 |
| 工具管理 | `/tools` | API 工具配置、测试、执行日志 |
| 智能体 | `/agents` | Agent 配置、知识库/工具绑定、工作流编排 |
| 安全管控 | `/safety` | 安全规则管理、安全日志、告警配置 |
| 工单管理 | `/tickets` | 工单列表、详情、处理日志、回复 |
| 系统设置 | `/settings` | LLM 配置、流水线配置、全局参数 |

## API 接口

后端 API 默认运行在 `http://localhost:3001/api`，主要端点：

| 模块 | 路径 | 说明 |
|------|------|------|
| 认证 | `/api/auth/*` | 登录、注册、获取当前用户 |
| 设置 | `/api/settings` | 系统配置（LLM、轮询等） |
| 邮箱账号 | `/api/email-accounts/*` | IMAP/SMTP 账号管理 |
| 集成 | `/api/integration/*` | 模拟邮件、手动消息 |
| 知识库 | `/api/knowledge-bases/*` | 知识库、文档、搜索、预览、编辑 |
| 意图 | `/api/intents/*` | 意图 CRUD、测试、绑定 Agent |
| 变量 | `/api/variables/*` | 变量 CRUD |
| 工具 | `/api/tools/*` | 工具 CRUD、测试、执行日志 |
| 智能体 | `/api/agents/*` | Agent CRUD、工作流步骤、工具绑定 |
| 安全 | `/api/safety/*` | 安全规则 CRUD、日志、告警配置 |
| 工单 | `/api/tickets/*` | 工单 CRUD、指派、回复 |
| 流水线 | `/api/pipeline/*` | 处理记录、重试、配置 |
| 分析 | `/api/analytics/*` | 概览、趋势、分布 |

## 开发说明

### 数据库操作

```bash
# 创建新的迁移
cd apps/server && npx prisma migrate dev --name <name>

# 查看数据库（可视化）
pnpm --filter @aics/server prisma:studio

# 重新生成 Prisma 客户端
pnpm db:generate
```

### 项目脚本

```bash
pnpm dev            # 同时启动前后端开发模式
pnpm build          # 构建所有包
pnpm build:web      # 仅构建前端
pnpm build:server   # 仅构建后端
pnpm db:migrate     # 运行数据库迁移
pnpm db:seed        # 导入种子数据
pnpm lint           # 代码检查
```

### 添加翻译

国际化翻译文件位于 `apps/web/messages/` 目录：

```
messages/
├── zh-CN.json   # 简体中文
├── en.json      # English
└── id.json      # Bahasa Indonesia
```

添加新文本时，需同步更新三个语言文件中对应的 key。

### 使用第三方 LLM

系统兼容 OpenAI API 格式，可通过修改 `LLM_BASE_URL` 接入 DeepSeek、智谱、通义千问等支持 OpenAI 兼容接口的模型服务。也可在系统设置页面动态修改 LLM 配置，无需重启服务。

> **注意**：如果使用的模型不支持 Embedding 接口，语义向量检索将不可用，系统会自动降级为关键词检索。

## License

MIT
