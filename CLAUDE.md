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
npm run dev             # 开发服务器, API 请求自动代理到 localhost:8000

# 前端构建 / Lint
npm run build
npm run lint
```

项目无测试套件，无 Makefile。Python 依赖用 pip，前端用 npm。

## 架构评估（关键）

### 当前问题

Python 后端做了过多不必要的工作。这类"自然语言→JSON→渲染"的项目，**天然适合 thin proxy + fat client**：

```
用户 → 前端 → Python后端(重) → LLM  ← 当前：后端校验/修复/重试/兜底全做了
用户 → 前端 → 轻量代理 → LLM      ← 正确：代理只隐藏 API Key
```

**后端真正需要的唯一职责：挡住 API Key 不暴露给浏览器。** 其余所有操作（JSON 解析、校验、样式覆盖、容错修复、居中）浏览器都能在 5ms 内完成。

### 已知架构缺陷

| 缺陷 | 位置 | 影响 |
|------|------|------|
| **validate 在 normalize 之前** | [ai_service.py:472](backend/services/ai_service.py#L472) | 可修复的箭头 id 拼写错误触发 120s AI 重试，而非 5ms 本地修复 |
| **重试兜底链** | [ai_service.py:396-426](backend/services/ai_service.py#L396-L426) | skeleton 失败 → AI 重试(120s) → Mermaid(120s) → skeleton(120s)，最坏 360s |
| **Mermaid 兜底违背硬性约束** | [ai_service.py:421-426](backend/services/ai_service.py#L421-L426) | Excalidraw 模式承诺可编辑元素，兜底却生成不可编辑 SVG |
| **无流式响应** | 全局 | 用户盯着空白画布等全程，30s 感知像 3 分钟 |

### API 超时约定

| 层级 | 超时 | 说明 |
|------|------|------|
| 客户端 fetch AbortController | 210s | [page.tsx:492](frontend/src/app/canvas/excalidraw/page.tsx#L492) |
| 后端 _call_api | 120s | [ai_service.py:137](backend/services/ai_service.py#L137) per-request |
| Next.js proxyTimeout | 300s | next.config.js |

客户端比后端多 90s 无意义等待——后端 120s 超时后立即返回错误，但客户端 AbortController 要到 210s 才触发。

## 项目规范

- **单文件 ≤ 555 行**，超出必须拆分。当前 `excalidraw_layout.py` (875行) 和 `ai_service.py` (718行) 已知超标，后续需进一步拆分。
- **嵌套 ≤ 4 层**。
- 优先编辑而非重写整个文件。除非文件被编辑过，否则不要重复读取已读过的文件。
- 输出简洁，推理详尽。中文回答。
- 依赖版本：`pydantic>=2.0`（使用 `field_validator` / `model_dump`，不兼容 v1）。

## 核心架构：v2.5 Thin Proxy + Fat Client

### 架构原则
Python 后端只做三件事：**隐藏 API Key + 流式透传 + 项目存储**。所有 AI 输出质量相关逻辑（prompt 组装、JSON 解析、容错修复、校验、样式强制、居中）全部在前端完成。

### Excalidraw 模式
- 前端拼 prompt（`excalidrawPrompt.ts`）→ POST `/api/chat/stream` → Python 注入 Key + fetch LLM stream → SSE 流式透传
- 流结束 → 前端 `skeletonPipeline.ts` 处理：extractCode → repairJson → parse → normalize（Levenshtein 修箭头 id）→ fixZero → validate → applyStyles → ensureBounds → center
- **normalize 在 validate 之前**：先修复，再校验。修复不了的才报错。不再有"可修复错误触发重试"的问题
- **失败直接报错**：不自动重试、不 Mermaid 兜底。Excalidraw 模式必须产出可编辑元素
- 前端通过 `applySkeletonToExcalidraw()` 渲染到画布

### Mermaid 模式（独立）
- 用户选择后走独立端点，Mermaid.js 渲染 SVG。不参与 Excalidraw 分流

### Python 后端保留端点
| 端点 | 用途 |
|------|------|
| POST `/api/chat/stream` | 流式 LLM 透传（注入 API Key + SSE 转发） |
| POST `/api/chat/edit` | 增量编辑（Diff DSL） |
| POST `/api/recognize-image` | 图片识别 |
| GET/POST `/api/projects` | 项目列表/创建 |
| GET/PATCH/DELETE `/api/projects/{id}` | 项目 CRUD |
| GET/POST `/api/config/llm` | LLM 配置管理 |

### 已删除
- `/api/generate-flowchart`、`/api/chat`、`/api/save-flowchart` — 被流式端点替代
- `backend/utils/excalidraw_*.py`、`style_enforcer.py` — 管线逻辑已移至前端 `skeletonPipeline.ts`
- `backend/prompts/excalidraw_hybrid.py`（skeleton 部分）— prompt 已移至前端 `excalidrawPrompt.ts`
- SmartIR 相关代码 — 单格式 prompt 策略不再需要中间表示层

## 核心架构：结构化精准增量编辑

生成图表后，用户可通过两种方式触发增量修改（而非全图重新生成），共享同一套 Diff DSL 架构：

### GraphModel 中间表示层 (`frontend/src/lib/graphModel.ts`)
- 将 Excalidraw 原始 JSON 数组抽象为 `{ nodes, edges, layout }` 结构化模型
- 提供 `elementsToGraphModel()` / `graphModelToElements()` 互转函数
- `cloneGraphModel()` 用于深拷贝快照

### Diff DSL (`frontend/src/lib/diffEngine.ts`)
- LLM 返回增量变更指令：`{ operations: [...], notes?: "..." }`
- 7 种操作类型：`add_node` / `delete` / `update_style` / `update_text` / `add_edge` / `reorder` / `move`
- `applyDiff(elements, diffResponse)` 只修改受影响的元素，其余保持不动
- 删除节点时自动清理关联边，新增边时自动更新两端节点的 `boundElements`
- `selection_edit` 模式下前端自动过滤 `add_node`/`delete`/`add_edge` 操作

### 两种交互模式
| 模式 | 触发方式 | API mode 参数 | 可改范围 |
|------|---------|-------------|---------|
| 聊天渐进搭图 | 聊天面板发消息（画布有元素时自动触发） | `chat_incremental` | 增删节点/连线 + 样式/文字/布局 |
| 画布选中局部编辑 | 画布选中元素 → 弹出输入框 | `selection_edit` | 仅样式/文字/位置（不增删节点） |

### 撤销/重做 (`frontend/src/lib/undoStack.ts`)
- 基于快照的历史栈（maxSize=50），每次 AI 修改前自动保存
- Ctrl+Z 撤销 / Ctrl+Shift+Z 重做

## 后端架构

```
backend/
├── main.py              # FastAPI 入口, lifespan 中预热 AI 服务
├── config.py            # 从 .env 读取 LLM 配置, 设定 DATA_DIR
├── api/routes.py        # 所有 REST 端点, 含增量编辑端点
├── models/schemas.py    # Pydantic 模型 (含 SmartIR/IRNode/IREdge + ChatEditRequest)
├── services/
│   ├── ai_service.py    # LLM 调用核心 + 混合分流 + 增量编辑
│   └── project_service.py  # 项目 CRUD, 存储在 data/projects.json
├── prompts/
│   ├── __init__.py          # 导出所有 prompt 函数
│   ├── excalidraw_hybrid.py # 混合分流提示词 (规范文档式, 推荐 skeleton 首选)
│   ├── incremental_edit.py  # 增量编辑提示词 (Diff DSL)
│   └── shared_styles.py / mermaid_generation.py / chat_assistant.py / image_recognition.py
└── utils/
    ├── excalidraw_utils.py        # Skeleton 校验/清洗/标准化/居中/bound 补全
    ├── excalidraw_layout.py       # 核心布局引擎 (流程图/动态尺寸/布局路由)
    ├── excalidraw_rich_layouts.py # 特殊布局 (时序/导图/ER/类图/SWOT/组织/时间线)
    ├── excalidraw_ir.py           # Smart IR 工具 (提取/修复/转换)
    ├── style_enforcer.py          # 样式强制 (roughness=1, role→配色映射, 所有路径统一)
    ├── mermaid_utils.py           # Mermaid 代码提取/校验
    ├── env_utils.py               # 运行时更新 .env 文件
    └── project_utils.py           # JSON 文件读写辅助
```

- **AIService** (`services/ai_service.py`): 单例模式，`httpx` 调用 OpenAI 兼容 API。
  - `_call_api()` — 核心 LLM 调用，含自动重试（max_retries=3），per-request timeout 覆盖 client-level 超时
  - `generate_flowchart()` → 路由到 `_generate_excalidraw_hybrid()` 或 `_generate_mermaid()`
  - `_generate_excalidraw_hybrid()` — 三路分流：skeleton（推荐）/ smartir（备选）/ mermaid
  - `chat_edit()` / `chat()` / `recognize_image()` — 增量编辑 / 对话 / 图片识别
- **LLM 调用参数硬约束**:
  - `max_tokens=64000` — 所有端点统一（给 AI 足够输出空间，避免复杂图表 JSON 被截断）
  - `max_retries=3` — API 层重试
  - Skeleton 首次超时 `timeout=120s`，重试 `timeout=120s`
  - temperature 不使用默认覆盖，由模型自行决定
- **数据存储**: 项目数据持久化在 `data/projects.json`，上传图片存在 `data/uploads/`

## 前端架构

```
frontend/src/app/
├── page.tsx                        # 首页: 模式选择 + prompt 输入 + 方向选择
├── layout.tsx                      # 根布局, 暗色模式脚本注入
├── canvas/
│   ├── excalidraw/page.tsx         # Excalidraw 编辑器页, 增量编辑集成
│   └── mermaid/page.tsx            # Mermaid 编辑器页 (Mermaid.js 直接渲染)
├── projects/page.tsx               # 项目管理页
└── settings/page.tsx               # LLM 配置页

frontend/src/lib/
├── excalidrawConverter.ts          # applySkeletonToExcalidraw() + mermaidToExcalidraw() + renderSvgFallback()
├── graphModel.ts                   # [增量编辑] GraphModel 类型定义 + Excalidraw 互转
├── diffEngine.ts                   # [增量编辑] Diff DSL 执行引擎, applyDiff()
├── undoStack.ts                    # [增量编辑] 撤销/重做历史栈 (快照模式)
├── mermaidUtils.ts                 # Mermaid 代码清洗 / 方向转换
└── projectApi.ts                   # 前端项目 API 客户端

frontend/src/components/
└── SelectionEditBar.tsx            # [增量编辑] 画布选中弹出输入框
```

- 前端通过 Next.js rewrites 将 `/api/*` 代理到 `localhost:8000/api/*`，proxyTimeout 300 秒
- Tailwind CSS v4，通过 `@tailwindcss/postcss` 插件
- 前端 API 请求超时 210s（略长于后端最坏情况）

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| POST | `/api/generate-flowchart` | 非流式生成 |
| POST | `/api/save-flowchart` | 保存流程图 |
| POST | `/api/chat` | AI 对话助手 |
| POST | `/api/chat/edit` | **结构化精准增量编辑**，mode: chat_incremental / selection_edit |
| POST | `/api/recognize-image` | 图片识别转图表 |
| GET | `/api/projects` | 获取所有项目 |
| POST | `/api/projects` | 创建新项目 |
| GET | `/api/projects/{id}` | 获取单个项目 |
| PATCH | `/api/projects/{id}` | 更新项目 |
| DELETE | `/api/projects/{id}` | 删除项目 |
| GET/POST | `/api/config/llm` | LLM 配置管理 |

**API 错误响应约定**: 所有端点 AI 生成失败时返回 **HTTP 200 + `{"success": false, "message": "错误详情"}`**，不返回 HTTP 500。前端通过 `json.success` 判断并直接展示 `json.message`。

## 关键数据流

1. **Excalidraw 图表生成（v2.5）**: 输入 → POST `/api/generate-flowchart` → `_generate_excalidraw_hybrid()` → 三路分流：
   - `FORMAT: skeleton` → `_handle_skeleton_body()` (repair_json → extract → validate → fix_zero → normalize → apply_styles_batch → ensure_bound → center)
   - `FORMAT: smartir` → `_handle_ir_body()` (extract_ir_object → SmartIR 校验 → repair_ir → ir_to_skeleton → auto_layout → normalize → apply_styles → postprocess)
   - `FORMAT: mermaid` → `_handle_mermaid_body()`
   → 返回 elements → 前端渲染
2. **Skeleton 容错**: extract 失败 → repair_json 预处理 → 校验失败 → AI 重试 1 次 → 仍失败则 Smart IR 或 Mermaid 兜底
3. **Smart IR 容错**: extract_ir_object 失败 → repair_json → 仍失败 → fallback 到 skeleton
4. **样式强制**: 所有路径（skeleton / smartir / mermaid 降级）最终都经过 `apply_styles_batch`，确保 roughness=1、strokeStyle="solid"、fillStyle="solid"
5. **增量编辑**: 画布有元素时用户发消息 → `elementsToGraphModel()` → POST `/api/chat/edit` → Diff DSL → `applyDiff()` → `excalidrawAPI.updateScene()` → 自动 undo 快照
6. **撤销/重做**: Ctrl+Z → `undoStack.undo()` → `updateScene({ elements, replaceScene: true })` → Ctrl+Shift+Z 重做
7. **项目持久化**: 新建项目后自动更新 URL 含 project ID，加载时清除陈旧保存计时器，已有内容的项目不重复自动生成

## 已知问题与排查指引

### 生成超时
- 症状：前端 210s 超时或后端 120s 超时，`generate_flowchart` 返回失败。
- 根因：per-request timeout 在 `_call_api()` 中通过 `httpx.Timeout(timeout, connect=10.0)` 传递给 `client.post()`。强模型生成复杂图表时 token 量大。
- 排查：检查 `.env` 中 `LLM_MODEL_ID`，确认 timeout 参数是否合理（skeleton 首次 120s，重试 120s）。

### "不是有效 JSON 数组"
- 症状：`extract_json_array` 返回 None，AI 返回的 JSON 无法解析。
- 已修复：`repair_json()` 预处理尾逗号、单引号 key → 双引号。
- 如果仍然失败：检查 AI 返回的原始 content（日志中可见），确认是否为合法的 JSON 数组格式。

### 项目持久化 BUG（已修复）
- v2.5 修复了 3 个相关 BUG：
  1. 新建项目后不更新 URL → `projectId` 为空 → `persistProject` 静默返回（`router.replace` 修复）
  2. URL 带 `prompt` 参数重新进入时覆盖已有图（检查 `excalidrawData.elements` 修复）
  3. 陈旧空元素保存计时器覆盖数据库（加载恢复时清除 `saveTimerRef` 修复）

### 文件交叉依赖
- `excalidraw_layout.py` 的 `_get_layout_func()` 对 `excalidraw_rich_layouts.py` 使用**函数内懒加载 import**，避免顶层循环依赖。不要在布局模块顶层添加对 rich_layouts 的导入。
