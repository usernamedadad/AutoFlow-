# AutoFlow+

AI 驱动的智能流程图生成工具，支持 **Excalidraw 手绘风格** 与 **Mermaid 代码渲染** 双模式编辑。

![Preview](./frontend/public/screenshot-homepage.png)

## 功能特性

- **双模式编辑器**
  - **Excalidraw 模式**：AI 直出坐标，生成可编辑的手绘风格流程图、时序图、SWOT 分析、组织架构图、思维导图
  - **Mermaid 模式**：经典代码渲染，支持全量 Mermaid 语法
- **AI 智能生成**：基于大语言模型，一句话描述即可自动生成专业图表
- **图片识别**：上传手绘草图或截图，AI 自动识别并转换为可编辑图表
- **项目管理**：创建、保存、重命名、删除项目，本地持久化存储
- **多种图表类型**：流程图、时序图、类图、状态图、ER 图、甘特图、饼图、象限图、思维导图等

## 核心架构

### 双轨渲染策略

AutoFlow+ 根据图表类型智能选择最优渲染路径：

| 输出格式 | 适用图表 | 技术实现 | 特点 |
|----------|----------|----------|------|
| **Skeleton** | SWOT、组织架构图、思维导图、象限图 | AI 直接输出 Excalidraw JSON 坐标 | 零解析损耗，像素级精准布局，完全可编辑 |
| **Mermaid** | 流程图、时序图、类图、状态图、ER 图等 | `@excalidraw/mermaid-to-excalidraw` 官方转换器 | 语法标准化，自动降级 SVG 兜底 |

- **Skeleton 格式**：针对复杂布局图表（如四象限 SWOT、树形组织架构），AI 直接返回元素的精确坐标、尺寸和样式，绕过 Mermaid 语法限制，实现手绘风格的自由排版。
- **Mermaid 格式**：针对标准流程图和时序图，AI 生成 Mermaid 代码，经 `@excalidraw/mermaid-to-excalidraw` 转换器解析为可编辑元素；如遇不兼容语法，自动降级为 SVG 渲染，保证可用性。



## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 14 + React 18 + TypeScript + Tailwind CSS v4 |
| 图表引擎 | @excalidraw/excalidraw + @excalidraw/mermaid-to-excalidraw + Mermaid.js |
| 核心算法 | **Skeleton 直出算法** + @dagrejs/dagre（布局） |
| 后端 | FastAPI + Python 3.10+ |
| AI 服务 | 支持 OpenAI 兼容接口（通过环境变量配置） |

> **Skeleton 直出算法**：项目核心自研能力。让 AI 直接输出 Excalidraw 元素的 JSON 骨架（坐标、尺寸、样式、绑定关系），配合防御性清洗、语义色保留和绑定修复，绕过 Mermaid 的语法与布局限制，实现复杂图表（SWOT、组织架构、思维导图等）的像素级精准布局。

## 快速开始

### 环境要求

- Node.js >= 18
- Python >= 3.10
- pnpm / npm / yarn

### 安装与启动

```bash
# 1. 克隆仓库
git clone <repo-url>
cd AutoFlow

# 2. 启动后端
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
# 复制 .env.example 为 .env 并填写 AI API 密钥
cp .env.example .env
python main.py / uvicorn main:app --reload

# 3. 启动前端（新终端）
cd ../frontend
npm install
npm run dev
```

访问 http://localhost:3000 即可使用。

### 环境变量配置

后端 `.env` 示例：

```env
LLM_API_KEY=your-api-key
LLM_BASE_URL=https://api.openai.com/v1/chat/completions
LLM_MODEL_ID=gpt-4o
```

## 项目结构

```
AutoFlow/
├── frontend/          # Next.js 前端
│   ├── src/app/       # 页面路由（含 Excalidraw / Mermaid 双编辑器）
│   ├── src/components/# React 组件
│   ├── src/lib/       # 工具库、API 封装、图表转换器
│   └── public/        # 静态资源
├── backend/           # FastAPI 后端
│   ├── api/           # 路由定义
│   ├── services/      # 业务逻辑（AI 调用、项目管理）
│   ├── prompts/       # AI 系统提示词（Skeleton / Mermaid 双模板）
│   └── utils/         # 工具函数
└── data/              # 本地数据存储
    ├── uploads/       # 用户上传图片
    └── projects.json  # 项目列表
```

## 许可证

[MIT](LICENSE)
