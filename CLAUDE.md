# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 启动命令

```bash
# 后端 (Python FastAPI, 端口 8000)
cd backend
pip install -r requirements.txt
cp .env.example .env   # 填写 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL_ID
python main.py          # 或: uvicorn main:app --reload

# 前端 (Next.js 14, 端口 3000)
cd frontend
npm install
npm run dev             # API 请求通过 next.config.js rewrites 代理到 localhost:8000

# 前端构建 / Lint
npm run build
npm run lint
```

项目无测试套件，无 Makefile。Python 依赖用 pip，前端用 npm。

## 项目规范

- **单文件 ≤ 555 行**，超出必须拆分。当前 `page.tsx`（~1367 行）和 `excalidrawConverter.ts`（~525 行，接近上限）已知超标。
- **嵌套 ≤ 4 层**。
- 优先编辑而非重写整个文件。
- 输出简洁，推理详尽。中文回答。
- 依赖版本：`pydantic>=2.0`（`model_dump` 接口），`httpx>=0.28`（`client.stream()` 接口）。

## 核心架构：v2.5 Thin Proxy + Fat Client

### 架构原则

Python 后端只做四件事：**隐藏 API Key + 流式透传 + 项目 CRUD + 图片识别**。所有 AI 输出质量相关逻辑（prompt 组装、JSON 解析、容错修复、校验、样式强制、居中）全部在前端完成。

### Excalidraw 模式数据流（v3 混合分流）

```
用户输入 → 前端拼 prompt (excalidrawPrompt.ts, ~100行)
  → POST /api/chat/stream { messages }
  → Python 注入 API Key + fetch LLM stream → SSE 流式透传
  → 前端实时解析 SSE delta.content → 累积完整 AI 输出
  → skeletonPipeline.ts: detectFormat（先于 extractCode 防丢失）
    → FORMAT:mermaid → mermaidToExcalidraw() 官方转换器，返回 mermaidCode 用于方向切换
    → FORMAT:compact → graphLayout.ts Dagre 自动布局 → Excalidraw 元素
    → FORMAT:skeleton → 原始数组 normalize → fixZeroDimension → validate
    → applyStyles → ensureBounds → center
  → applySkeletonToExcalidraw() → excalidrawAPI.updateScene()
```

**三路分流策略**：
- 流程图/时序图 → `FORMAT:mermaid` → `@excalidraw/mermaid-to-excalidraw` 官方转换器
  - LLM 输出 50-200 token，速度极快，质量有保证
- 层级/关系类（组织架构、思维导图、ER图、网络拓扑）→ `FORMAT:compact` → Dagre 布局
  - LLM 输出 300-800 token 的图结构 JSON，无需坐标/配色
  - Dagre 自动计算节点位置和边路由
- 分析/特殊类（SWOT、类图、时间线、泳道图、状态图、甘特图等）→ `FORMAT:skeleton` → 原始 Excalidraw JSON
  - LLM 全权控制坐标、配色、排版，适合非图结构的复杂布局
  - 走 normalize → fix → validate → style → center 管线

关键设计决策：
- **skeleton 格式不限制 LLM 创意**：非图结构图表需要自定义坐标和配色，Dagre 布局不适用
- **compactGraphToExcalidraw 自动配色**：按 node.role 匹配预设色板（仅图结构类型）
- **Dagre 生产级布局**：自动处理分支展开、间距、边路由
- **方向由 User Prompt 控制**：不在 System Prompt 中硬编码 TD/LR
- **Mermaid 方向切换为纯前端操作**：pipeline 返回 mermaidCode → 方向变化时改写 graph TD/LR → re-render，不走 LLM
- **非 Mermaid 图方向切换需重新生成**：handleGenerateFromPrompt 接受 forceDirection 参数，绕过 React 异步 state 问题
- **向后兼容**：skeletonPipeline 同时支持三种格式

### Mermaid 模式（独立）

走独立端点 `POST /api/generate-flowchart`（非流式），后端 `_generate_mermaid()` 调用 LLM → 返回 Mermaid 代码 → 前端 Mermaid.js 渲染 SVG。不参与 Excalidraw 分流。

### 配置变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `LLM_API_KEY` | — | API 密钥 |
| `LLM_BASE_URL` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 兼容 OpenAI 格式的 Base URL |
| `LLM_MODEL_ID` | `qwen-plus` | 模型 ID |
| `LLM_MAX_TOKENS` | `6000` | 流式端点最大输出 token 数，可按模型上限调整 |

配置热更新（`POST /api/config/llm`）通过 `load_dotenv(override=True)` + 直接读写 `os.environ` + 同步更新 `config` 模块变量实现，立即生效无需重启。

## 项目结构（实际）

```
backend/
├── main.py                     # FastAPI 入口, CORS + lifespan 预热 + DATA_DIR 初始化
├── config.py                   # dotenv → 模块级常量, LLM_MAX_TOKENS 含 ValueError 兜底
├── api/routes.py               # 所有 REST 端点
├── models/schemas.py           # Pydantic: ChatEditRequest + Project CRUD (3 models)
├── services/
│   ├── ai_service.py           # LLM 调用核心 (_call_api + streaming + chat_edit)
│   └── project_service.py      # 项目 CRUD, threading.Lock 保护文件并发读写
├── prompts/                    # 后端 prompt (Mermaid/image/chat/incremental_edit)
└── utils/
    ├── mermaid_utils.py        # Mermaid 代码提取/校验
    ├── project_utils.py        # JSON 文件读写（含异常日志）
    └── env_utils.py            # 运行时写 .env 文件

frontend/src/
├── app/
│   ├── page.tsx                # 首页
│   ├── layout.tsx              # 根布局, EXCALIDRAW_ASSET_PATH 设置
│   ├── canvas/excalidraw/page.tsx  # Excalidraw 编辑器 (~1367行, 超标)
│   ├── canvas/mermaid/page.tsx     # Mermaid 编辑器
│   ├── projects/page.tsx       # 项目管理
│   └── settings/page.tsx       # LLM 配置
├── lib/
│   ├── excalidrawPrompt.ts     # Excalidraw System Prompt + buildUserPrompt (三路分流: mermaid/compact/skeleton)
│   ├── skeletonPipeline.ts     # AI 输出处理管线 (async, detectFormat先于extractCode, 返回mermaidCode)
│   ├── graphLayout.ts          # Dagre 布局引擎 (compactGraphToExcalidraw, 自动配色按role)
│   ├── excalidrawConverter.ts  # applySkeletonToExcalidraw + mermaidToExcalidraw + SVG 兜底
│   ├── graphModel.ts           # GraphModel 中间表示 (elementsToGraphModel / graphModelToElements)
│   ├── diffEngine.ts           # Diff DSL 执行引擎, 8种操作含 update_shape
│   ├── undoStack.ts            # 快照式撤销/重做 (maxSize=50)
│   ├── mermaidUtils.ts         # Mermaid 清洗/方向转换
│   └── projectApi.ts           # 项目 API 客户端
└── components/                 # UI 组件 (SelectionEditBar, Sidebar, AIAssistantPanel 等)
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| POST | `/api/chat/stream` | **流式 LLM 透传** (v2.5 核心端点) |
| POST | `/api/chat/edit` | 增量编辑 Diff DSL |
| POST | `/api/generate-flowchart` | Mermaid 模式图表生成（非流式） |
| POST | `/api/recognize-image` | 图片识别转图表 |
| GET/POST | `/api/projects` | 项目列表/创建 |
| GET/PATCH/DELETE | `/api/projects/{id}` | 项目 CRUD |
| GET/POST | `/api/config/llm` | LLM 配置管理（不泄露 API Key） |

**错误响应约定**：AI 生成失败返回 HTTP 200 + `{"success": false, "message": "..."}`，不返回 500。前端通过 `json.success` 判断。

## 超时约定

| 层级 | 超时 | 位置 |
|------|------|------|
| 前端 AbortController | 120s | `handleGenerateFromPrompt` 中 setTimeout + AbortController |
| 后端 _call_api per-request | 60-120s | `ai_service.py:_call_api()` |
| 流式透传总超时 | 120s | `routes.py:chat_stream` httpx client timeout，前端 120s AbortController |
| Next.js proxyTimeout | 300s | next.config.js |

## 增量编辑架构

- **GraphModel** (`graphModel.ts`)：Excalidraw 原始 JSON ↔ `{ nodes, edges, layout }` 互转
- **DiffEngine** (`diffEngine.ts`)：执行 LLM 返回的 8 种操作（add_node/delete/update_style/update_text/**update_shape**/add_edge/reorder/move），删除节点自动清理关联边，新增边根据源/目标节点自动计算坐标。update_shape 支持 rectangle/ellipse/diamond 之间互转
- **UndoStack** (`undoStack.ts`)：快照历史栈 (maxSize=50)，Ctrl+Z / Ctrl+Shift+Z
- **两种模式**：聊天渐进搭图 (`chat_incremental`) / 画布选中编辑 (`selection_edit`，样式/文字/位置/**形状**)

## 安全注意

- 文件上传通过 `_sanitize_filename()` 过滤路径穿越字符
- Mermaid 渲染使用 `securityLevel: "antiscript"`（非 "loose"）
- CORS 无 credentials（`allow_credentials=False`）
- `GET /api/config/llm` 不返回 API Key 明文（仅返回 `has_api_key` 布尔值）
- `project_service` 所有文件读写由 `threading.Lock` 保护，防止并发数据丢失

## 供应商兼容性

项目使用 OpenAI 兼容 API 格式（`/chat/completions` + Bearer 认证 + SSE streaming），切换供应商只需改 `.env` 三个变量：

| 供应商 | LLM_BASE_URL | 示例模型 |
|--------|-------------|---------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o` |
| 阿里云百炼 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus`, `glm-4.7` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-v4-flash` |
