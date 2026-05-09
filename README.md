# AutoFlow+

AI 驱动的智能图表生成工具，支持 **Excalidraw 手绘风格** 与 **Mermaid 代码渲染** 双模式编辑，具备结构化精准增量编辑能力。

## 功能特性

- **双模式编辑**：Excalidraw 手绘风格 + Mermaid 代码渲染，一句话描述即可生成专业图表
- **v2.5 Thin Proxy 架构**：Python 后端只做 API Key 隐藏 + 流式透传 + 项目存储，所有 AI 输出质量逻辑（prompt 组装 / JSON 修复 / 容错 / 样式强制 / 居中）均在前端完成
- **流式响应**：SSE 流式透传，生成过程实时可见，无需盯着空白画布等待
- **结构化增量编辑**：生成图表后，通过 Diff DSL 精准修改局部元素，无需全图重新生成
- **画布选中编辑**：选中画布元素直接输入指令，修改样式/文字/位置，即改即得
- **撤销/重做**：Ctrl+Z / Ctrl+Shift+Z，基于快照的历史栈
- **图片识别**：上传手绘草图或截图，AI 自动识别并转换为可编辑图表
- **项目管理**：创建、保存、重命名、删除项目，本地持久化存储

## 核心架构

### 1. Excalidraw 模式（v2.5 Thin Proxy）

```
用户输入 → 前端拼 prompt → POST /api/chat/stream → Python 注入 Key + 流式透传 LLM
         → 前端 skeletonPipeline.ts 处理 → applySkeletonToExcalidraw() → 画布渲染
```

| 阶段 | 位置 | 职责 |
|------|------|------|
| Prompt 组装 | 前端 `excalidrawPrompt.ts` | 单格式聚焦 prompt，只教 Excalidraw |
| LLM 代理 | Python `/api/chat/stream` | 注入 API Key + SSE 流式透传，不做任何处理 |
| 管线处理 | 前端 `skeletonPipeline.ts` | repairJson → parse → normalize（容错修复）→ validate → applyStyles → center |

**设计原则**：
- **normalize 在 validate 之前**：先修复再校验，可修复的错误（箭头 id 拼写偏差）不触发失败
- **失败直接报错**：不自动重试、不 Mermaid 兜底。Excalidraw 模式必须产出可编辑元素
- **不覆盖 AI 配色**：只强制 roughness=1 / strokeStyle="solid" 等风格一致性参数

### 2. Mermaid 模式（独立）

### 2. 结构化精准增量编辑

生成图表后，通过 Diff DSL 精准修改，而非全图重新生成：

| 交互模式 | 触发方式 | 可改范围 |
|----------|----------|----------|
| **聊天渐进搭图** | 聊天面板发消息（画布有元素时自动触发） | 增删节点/连线 + 样式/文字/布局 |
| **画布选中编辑** | 画布选中元素 → 弹出输入框 | 样式/文字/位置（不增删节点） |

**核心模块**：

- **[GraphModel](frontend/src/lib/graphModel.ts)**：将 Excalidraw 原始 JSON 抽象为 `{ nodes, edges, layout }` 结构化模型，提供 `elementsToGraphModel()` / `graphModelToElements()` 互转
- **[DiffEngine](frontend/src/lib/diffEngine.ts)**：执行 LLM 返回的增量变更指令，支持 7 种操作（add_node / delete / update_style / update_text / add_edge / reorder / move），删除节点自动清理关联边
- **[UndoStack](frontend/src/lib/undoStack.ts)**：基于快照的历史栈（maxSize=50），Ctrl+Z 撤销 / Ctrl+Shift+Z 重做
- **[SelectionEditBar](frontend/src/components/SelectionEditBar.tsx)**：画布选中元素时自动弹出输入框，在画布内部定位，随滚动/缩放联动

### 3. Mermaid 模式

独立渲染路径，使用 Mermaid.js 直接渲染 SVG（不可编辑），支持全部 Mermaid 语法。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 14 + React 18 + TypeScript + Tailwind CSS v4 |
| 图表引擎 | @excalidraw/excalidraw + @excalidraw/mermaid-to-excalidraw + Mermaid.js |
| 后端 | FastAPI + Python 3.10+ |
| AI 服务 | httpx 调用 OpenAI 兼容接口 |

## 快速开始

### 环境要求

- Node.js >= 18
- Python >= 3.10

### 安装与启动

```bash
# 1. 克隆仓库
git clone <repo-url>
cd AutoFlow+

# 2. 启动后端
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env      # 填写 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL_ID
python main.py            # 或: uvicorn main:app --reload --port 8000

# 3. 启动前端（新终端）
cd ../frontend
npm install
npm run dev
```

访问 http://localhost:3000 即可使用。

### 环境变量

```env
LLM_API_KEY=your-api-key
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL_ID=gpt-4o
```

## 项目结构

```
AutoFlow+/
├── frontend/src/
│   ├── app/
│   │   ├── page.tsx                       # 首页：模式选择 + prompt 输入
│   │   ├── canvas/excalidraw/page.tsx     # Excalidraw 编辑器（混合分流 + 增量编辑）
│   │   ├── canvas/mermaid/page.tsx        # Mermaid 编辑器
│   │   ├── projects/page.tsx              # 项目管理
│   │   └── settings/page.tsx              # LLM 配置
│   ├── lib/
│   │   ├── excalidrawConverter.ts         # Skeleton 渲染 + Mermaid 转换 + SVG 兜底
│   │   ├── graphModel.ts                  # GraphModel 中间表示层
│   │   ├── diffEngine.ts                  # Diff DSL 执行引擎
│   │   ├── undoStack.ts                   # 撤销/重做历史栈
│   │   ├── mermaidUtils.ts                # Mermaid 清洗/方向转换
│   │   └── projectApi.ts                  # 项目 API 客户端
│   └── components/
│       └── SelectionEditBar.tsx           # 画布选中弹出输入框
├── backend/
│   ├── main.py                            # FastAPI 入口
│   ├── api/routes.py                      # REST 端点
│   ├── models/schemas.py                  # Pydantic 模型
│   ├── services/
│   │   ├── ai_service.py                  # LLM 调用 + 增量编辑
│   │   └── project_service.py             # 项目 CRUD
│   ├── prompts/
│   │   ├── excalidraw_hybrid.py           # 混合分流提示词
│   │   ├── mermaid_generation.py          # Mermaid 生成提示词
│   │   ├── incremental_edit.py            # 增量编辑提示词
│   │   ├── image_recognition.py           # 图片识别提示词
│   │   ├── chat_assistant.py              # 对话助手提示词
│   │   └── shared_styles.py              # 共享配色与样式常量
│   └── utils/
│       ├── excalidraw_utils.py            # Skeleton 管道
│       ├── mermaid_utils.py               # Mermaid 代码提取/校验
│       └── project_utils.py               # JSON 读写辅助
└── data/
    ├── projects.json                      # 项目数据
    └── uploads/                           # 上传图片
```

## 许可证

[MIT](LICENSE)
