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

### 标签管理
- 全局标签 CRUD（名称唯一、自定义颜色）
- 工单-标签多对多关联（添加/移除/筛选）
- 工单列表标签筛选（多选 OR 逻辑）
- 工单详情可搜索标签选择器

### 意图识别
- LLM 驱动的意图分类
- 预设意图 + 自定义意图
- 意图动作编排：支持多个有序动作（执行 Agent / 打标签 / 转人工处理）
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

## 核心业务执行逻辑

### 处理流水线（Pipeline）

系统通过 5 阶段异步流水线处理客服工单，每阶段由 BullMQ 队列驱动，最多重试 3 次（指数退避，初始 5 秒）。

```
邮件收取/手动创建 → Ingest → Intent → Variable → Agent → Safety → 自动回复/转人工
```

#### 阶段 1：收录（Ingest）
- **队列**：`pipeline-ingest`
- **逻辑**：将工单状态更新为 `processing`，创建 `intent` 阶段记录并入队
- **失败处理**：标记 `ingest` 阶段失败，抛出异常触发重试

#### 阶段 2：意图识别（Intent）
- **队列**：`pipeline-intent`
- **逻辑**：
  1. 取工单最新一条客户入站消息
  2. 调用 `IntentRecognitionService.recognize(message)` 做 LLM 意图分类
  3. 更新工单的 `intentId`
  4. 加载该意图的 `IntentAction` 列表（按 order 排序），按序执行：
     - `add_tag`：创建工单-标签关联，继续下一动作
     - `execute_agent`：设置工单 `agentId`，入队 `pipeline-variable`，**中断动作链**
     - `escalate`：设置工单状态为 `escalated`，自动分配人工客服，**中断动作链**
  5. 若无动作配置，降级读取 `boundAgentId`（兼容旧数据）；仍无则自动升级
- **分支**：未识别意图 → 直接升级转人工；识别到意图但无 `execute_agent` → 处理完标签后升级

#### 阶段 3：变量提取（Variable）
- **队列**：`pipeline-variable`
- **逻辑**：
  1. 取客户最新消息
  2. 调用 `VariableExtractionService.extractAll(message, metadata)` 三层提取：
     - **Tier 1 元数据同步**：从邮件头等 metadata 直接获取
     - **Tier 2 关键词匹配**：列表变量按 item keywords 匹配；值变量按正则匹配
     - **Tier 3 LLM 智能提取**：构造 prompt 调用 LLM（`temperature: 0`），要求返回纯值或 `NONE`
  3. 以 upsert 方式写入 `TicketVariable`
  4. 入队 `pipeline-agent`

#### 阶段 4：Agent 处理（Agent）
- **队列**：`pipeline-agent`
- **逻辑**：
  1. 若工单无 `agentId` → 直接升级转人工
  2. 构建变量 map 和对话历史
  3. 调用 `AgentExecutionService.execute(agentId, context)` 生成回复（详见下方 Agent 执行逻辑）
  4. 将生成的回复（draft）连同 `ticketId` 入队 `pipeline-safety`
- **注意**：回复此时为草稿，不入库消息表，由 Safety 通过后才正式落库

#### 阶段 5：安全审核（Safety）
- **队列**：`pipeline-safety`
- **逻辑**：
  1. 调用 `SafetyCheckService.checkReply()` 对回复做多规则安全检查
  2. 读取系统设置 `auto_reply_enabled`
  3. **安全通过 + 自动回复开启**：
     - 创建出站消息记录（sender: `ai`）
     - 若来源为 email → 调用 SMTP 发送邮件
     - 更新工单状态为 `awaiting_reply`
  4. **安全不通过 / 自动回复关闭**：
     - 工单状态设为 `escalated`
     - 自动分配人工客服
     - 保存草稿和违规详情供人工审阅

---

### 意图识别（Intent Recognition）

- **入口**：`IntentRecognitionService.recognize(message)`
- **逻辑**：
  1. 获取所有启用的意图列表（含名称、描述、示例话术）
  2. 构建 prompt：将意图列表格式化为 LLM 可读的分类清单
  3. 调用 LLM（`temperature: 0.1`），要求返回 JSON：`{ intent, confidence, alternatives }`
  4. 在本地意图列表中按名称匹配（`toLowerCase`），返回 `intentId`、`confidence` 和备选列表
  5. 解析失败 → 返回 `unknown`，`confidence: 0`
- **特点**：纯 LLM 驱动分类，非关键词匹配

---

### Agent 执行逻辑

- **入口**：`AgentExecutionService.execute(agentId, context)`
- **返回**：`{ reply, agentId, agentName, usage }`

#### 对话型 Agent（Conversational）
1. 从绑定知识库做 **RAG 检索**，拼接为知识上下文
2. 用工单变量替换系统提示词中的 `{{变量名}}`
3. 在 prompt 中追加知识库内容和可用工具说明
4. 加载绑定的工具，转为 LLM function 定义
5. 构建消息：system + 历史对话 + 当前用户消息
6. **工具调用循环**（最多 10 轮）：
   - 调用 LLM（`tool_choice: 'auto'`）
   - 若 LLM 返回 `tool_calls` → 逐个执行工具 → 将结果追加到消息 → 继续循环
   - 若 LLM 返回文本回复 → 结束循环，返回回复
7. 超过 10 轮 → 强制不带工具再调用一次 LLM 作为最终回复

#### 工作流型 Agent（Workflow）
按步骤顺序执行，支持步骤类型：
| 步骤类型 | 说明 |
|---------|------|
| `llm_call` | 调用 LLM 并将结果存入工作流变量 |
| `condition` | 条件分支（支持 `equals`、`contains`、`not_equals`） |
| `variable_set` | 设置工作流变量 |
| `sub_agent` | 递归调用子 Agent |
| `http_request` | 发起 HTTP 请求 |
| `tool_call` | 调用已配置的工具 |

---

### 知识检索（RAG）

- **入口**：`KnowledgeRetrievalService.retrieve(query, knowledgeBaseIds?, topK?, threshold?)`
- **两级检索策略**：

  **1. 优先语义检索（向量）**
  1. 调用 `LlmService.embed(query)` 获取查询向量
  2. 加载知识库中所有有 embedding 的 chunk
  3. 逐条计算余弦相似度，过滤 `similarity >= threshold`（默认 0.7）
  4. 按相似度排序取 `topK`（默认 5）条

  **2. 回退关键词检索（语义检索异常时）**
  1. 使用 CJK 优化分词器 `tokenizeForSearch(query)`
     - 非 CJK 字符按空格/标点切分
     - CJK 字符抽取 2-gram + 短片段，过滤停用词
  2. 对每个 chunk 的 content 做关键词 OR 匹配
  3. 按匹配率（`matchCount / totalKeywords`）排序取 `topK`

---

### 安全检查（Safety Check）

- **入口**：`SafetyCheckService.checkReply(ticketId, replyContent, customerMessage, history?)`
- **返回**：`{ passed: boolean, violations: [...] }`

#### 三种检查类型
| 类型 | 逻辑 |
|------|------|
| **keyword** | 检查回复是否包含规则中配置的关键词（不区分大小写）；若规则名含 "Repeated"，检查回复在历史中重复次数 ≥ 3 |
| **regex** | 用规则配置的正则表达式匹配回复内容 |
| **llm** | 按规则名选预设 prompt（伪造链接、伪造升级、无效帮助、语气态度、语言一致性等），调用 LLM（`temperature: 0`），返回 JSON `{ violated, details }` |

#### 通过判定
- 存在任一 violation 的 `action` 为 `block` 或 `escalate` → **不通过**
- 仅有 `flag` 或 `warn` 类型的 violation → **通过**（仅标记，不拦截）

每次违规均写入 `SafetyLog` 表用于审计。

---

### 工具执行（Tool Execution）

- **入口**：`ToolExecutionService.execute(toolId, params, context?)`

#### 执行流程
1. 加载工具配置（URL、方法、认证、参数定义、响应映射）
2. **参数解析**：显式传入 > 变量绑定 > 默认值
3. **构建 HTTP 请求**：
   - URL 模板变量替换 `{{paramName}}`
   - Body 模板变量替换
   - 认证注入（Bearer Token / API Key / Basic Auth）
4. 发送 HTTP 请求（axios）
5. **响应映射**：若配置了 `responseMapping`，使用 JSONPath 提取响应字段写入 `TicketVariable`
6. 写入 `ToolExecutionLog`（记录请求、响应、耗时、成功/失败）

---

### 邮件收发

#### 邮件收取（Email Polling）
- **定时**：`@Cron(EVERY_MINUTE)` 每分钟轮询
- **流程**：
  1. 获取所有启用的邮箱账户
  2. 逐个 IMAP 连接 → 国内邮箱发送 IMAP ID 命令（RFC 2971）
  3. 打开 INBOX → 搜索 `UNSEEN` 未读邮件
  4. 用 `mailparser` 解析邮件（发件人、主题、正文、附件等）
  5. 按 `Message-ID` 去重
  6. 若有 `In-Reply-To` → 追加到已有工单；否则 → 创建新工单
  7. 调用 `pipelineService.enqueueTicket()` 进入 AI 处理流水线

#### 邮件发送（Email Send）
- **入口**：`EmailSendService.sendReply(emailAccountId, to, subject, htmlBody, inReplyTo?, references?)`
- **流程**：加载 SMTP 配置 → 构建 RFC 邮件（含 `In-Reply-To`/`References` 头实现邮件线程） → 发送

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
| 意图管理 | `/intents` | 意图配置、动作编排（执行 Agent / 打标签 / 转人工）、测试 |
| 标签管理 | `/tags` | 标签 CRUD、颜色配置 |
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
| 标签 | `/api/tags/*` | 标签 CRUD |
| 意图 | `/api/intents/*` | 意图 CRUD、动作配置、测试 |
| 变量 | `/api/variables/*` | 变量 CRUD |
| 工具 | `/api/tools/*` | 工具 CRUD、测试、执行日志 |
| 智能体 | `/api/agents/*` | Agent CRUD、工作流步骤、工具绑定 |
| 安全 | `/api/safety/*` | 安全规则 CRUD、日志、告警配置 |
| 工单 | `/api/tickets/*` | 工单 CRUD、指派、回复、标签管理 |
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
