# AutoFlow+

AI 驱动的智能图表生成工具，支持 **Excalidraw 手绘风格** 与 **Mermaid 代码渲染** 双模式编辑，具备增量编辑能力。

## 功能特性

- **双模式编辑**：Excalidraw 手绘风格 + Mermaid 代码渲染，自然语言描述即可生成专业图表
- **多类型支持**：流程图、时序图、ER 图、类图、思维导图、组织架构图、SWOT 分析、网络拓扑图等
- **流式生成**：SSE 实时流式响应，生成过程可见
- **增量编辑**：生成图表后，通过对话或画布选中精准修改局部元素，支持改样式、文字、形状、位置，可增删节点和连线
- **撤销/重做**：Ctrl+Z / Ctrl+Shift+Z，快照式历史栈
- **方向切换**：流程图和时序图支持 TD/LR 方向实时切换，无需重新生成
- **图片识别**：上传手绘草图或截图，AI 自动识别并转换为可编辑图表
- **项目管理**：创建、保存、重命名、删除项目，本地持久化存储

## 快速开始

### 环境要求

- Node.js >= 18
- Python >= 3.10

### 安装与启动

```bash
# 1. 启动后端
cd backend
pip install -r requirements.txt
cp .env.example .env      # 填写 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL_ID
python main.py            # 后端运行在 http://localhost:8000

# 2. 启动前端（新终端）
cd frontend
npm install
npm run dev               # 前端运行在 http://localhost:3000
```

访问 http://localhost:3000 即可使用。

### 环境变量

```env
LLM_API_KEY=your-api-key
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL_ID=gpt-4o
# LLM_MAX_TOKENS=6000   # 可选
```

兼容任意 OpenAI 格式的 API 供应商（OpenAI / 阿里云百炼 / DeepSeek 等），只需修改以上变量。

## 架构概览

### Excalidraw 模式

LLM 根据图表类型自动选择最优输出格式：

| 图表类型 | 输出格式 | 说明 |
|----------|----------|------|
| 流程图 / 时序图 | Mermaid 代码 | 官方 `@excalidraw/mermaid-to-excalidraw` 转换，速度快质量高 |
| 组织架构 / 思维导图 / ER 图 / 网络拓扑 | 紧凑图结构 JSON | Dagre 自动布局引擎计算坐标，无需 LLM 指定像素位置 |
| SWOT / 类图 / 时间线 / 泳道图等 | 原始 Excalidraw JSON | LLM 全权控制布局和配色，适合复杂排版 |

生成管线：`LLM 流式输出 → 格式检测 → 对应转换器/布局引擎 → 样式归一化 → 画布渲染`

### Mermaid 模式

独立渲染路径，使用 Mermaid.js 直接渲染 SVG。走独立端点，不参与 Excalidraw 分流。

### 增量编辑

通过 Diff DSL 精准修改图表，支持 8 种操作：

| 操作 | 说明 |
|------|------|
| `update_style` | 修改颜色、边框、字体等样式 |
| `update_text` | 更新文本内容 |
| `update_shape` | 切换形状（rectangle / ellipse / diamond） |
| `add_node` | 添加新节点 |
| `add_edge` | 添加连线 |
| `delete` | 删除节点 |
| `move` | 移动位置 |
| `reorder` | 调整排列顺序 |

两种交互方式：**聊天渐进搭图**（对话中自动触发）和**画布选中编辑**（选中元素后弹出输入框，支持样式/文字/形状/位置修改）。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 14 + React 18 + TypeScript + Tailwind CSS v4 |
| 图表引擎 | @excalidraw/excalidraw + @excalidraw/mermaid-to-excalidraw + Mermaid.js |
| 布局引擎 | @dagrejs/dagre（自动计算节点位置和边路由） |
| 后端 | FastAPI + Python 3.10+ |
| AI 服务 | httpx 调用 OpenAI 兼容接口（SSE streaming） |

## 项目结构

```
AutoFlow+/
├── frontend/src/
│   ├── app/
│   │   ├── page.tsx                       # 首页：模式选择 + prompt 输入
│   │   ├── canvas/excalidraw/page.tsx     # Excalidraw 编辑器
│   │   ├── canvas/mermaid/page.tsx        # Mermaid 编辑器
│   │   ├── projects/page.tsx              # 项目管理
│   │   └── settings/page.tsx              # LLM 配置
│   ├── lib/
│   │   ├── excalidrawPrompt.ts            # System Prompt（三路分流）
│   │   ├── skeletonPipeline.ts            # AI 输出处理管线
│   │   ├── graphLayout.ts                 # Dagre 布局引擎
│   │   ├── excalidrawConverter.ts         # Excalidraw 格式转换 + Mermaid 互转
│   │   ├── graphModel.ts                  # 结构化中间表示
│   │   ├── diffEngine.ts                  # Diff DSL 执行引擎
│   │   ├── undoStack.ts                   # 撤销/重做
│   │   ├── mermaidUtils.ts                # Mermaid 工具函数
│   │   └── projectApi.ts                  # 项目 API 客户端
│   └── components/                        # UI 组件
├── backend/
│   ├── main.py                            # FastAPI 入口
│   ├── api/routes.py                      # REST 端点
│   ├── models/schemas.py                  # Pydantic 模型
│   ├── services/
│   │   ├── ai_service.py                  # LLM 调用
│   │   └── project_service.py             # 项目 CRUD
│   ├── prompts/                           # 后端 prompt 模板
│   └── utils/                             # 工具函数
└── data/                                  # 项目数据 + 上传文件
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/chat/stream` | 流式 LLM 透传 |
| POST | `/api/chat/edit` | 增量编辑 |
| POST | `/api/generate-flowchart` | Mermaid 图表生成 |
| POST | `/api/recognize-image` | 图片识别 |
| GET/POST | `/api/projects` | 项目列表/创建 |
| GET/PATCH/DELETE | `/api/projects/{id}` | 项目 CRUD |
| GET/POST | `/api/config/llm` | LLM 配置管理 |

## 许可证

[MIT](LICENSE)
