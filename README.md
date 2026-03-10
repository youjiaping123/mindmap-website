# AI 思维导图生成器# AI 思维导图生成器



输入主题，AI 自动生成思维导图。支持模型选择、预设风格、对话式修改、历史记录、在线预览、下载 .xmind 和 PNG。输入主题，AI 自动生成思维导图。支持在线预览、下载 .xmind 文件和 PNG 图片。



## ✨ 功能特性## 技术栈



- 🤖 **AI 生成** - 输入主题一键生成结构化思维导图- **AI**: [OpenAI API](https://platform.openai.com/) (GPT-4o)

- 🎯 **风格预设** - 简洁 / 详尽 / 创意 三种预设提示词风格- **思维导图渲染**: [Markmap](https://markmap.js.org/) (Markdown → SVG)

- 📝 **自定义提示词** - 支持完全自定义 AI 系统提示词- **.xmind 导出**: [JSZip](https://stuk.github.io/jszip/) (生成 Xmind 兼容文件)

- 💬 **对话修改** - 通过自然语言对话局部修改节点（展开/删除/重命名/插入/替换）- **PNG 导出**: SVG → Canvas → PNG

- 📜 **历史记录** - 自动保存到 localStorage，随时回看- **部署**: [Vercel](https://vercel.com) (免费静态托管 + Serverless Functions)

- 🤖 **模型选择** - 自动获取可用模型列表

- 📥 **多格式导出** - 下载 .xmind 文件或高清 PNG 图片## 项目结构

- 📱 **响应式设计** - 适配桌面端和移动端

```

## 技术栈mindmap-website/

├── api/

- **AI**: [OpenAI 兼容 API](https://platform.openai.com/) (GPT-4o / DeepSeek / 等)│   └── generate.js       # Vercel Serverless Function (调用 OpenAI API)

- **思维导图渲染**: [Markmap](https://markmap.js.org/) (Markdown → SVG)├── index.html            # 主页面

- **.xmind 导出**: [JSZip](https://stuk.github.io/jszip/)├── style.css             # 样式

- **PNG 导出**: SVG → Canvas → PNG├── app.js                # 主逻辑 (渲染、交互)

- **部署**: [Vercel](https://vercel.com) (静态托管 + Serverless Functions)├── xmind-export.js       # .xmind 文件生成模块

├── png-export.js         # PNG 图片导出模块

## 项目结构├── vercel.json           # Vercel 配置

├── package.json

```└── README.md

mindmap-website/```

├── api/                    # Vercel Serverless Functions

│   ├── _shared.js          # 公共配置与工具函数## 部署步骤

│   ├── generate.js         # 生成思维导图 API

│   ├── chat.js             # 对话修改 API (JSON patch 模式)### 1. 部署到 Vercel

│   └── models.js           # 获取可用模型列表 API

├── js/                     # 前端模块化 JS#### 方式 A: 使用 Vercel CLI

│   ├── constants.js        # 全局常量与默认提示词

│   ├── utils.js            # 通用工具函数```bash

│   ├── state.js            # 全局应用状态# 安装 Vercel CLI

│   ├── ui.js               # UI 工具函数 (加载状态、错误提示、Tab切换)npm i -g vercel

│   ├── markmap.js          # Markmap 渲染

│   ├── markdown-engine.js  # Markdown 局部操作引擎 (5种操作)# 进入项目目录

│   ├── history.js          # 历史记录管理 (localStorage)cd mindmap-website

│   ├── models.js           # 模型列表加载

│   ├── presets.js          # 预设提示词风格# 部署

│   ├── prompt.js           # 自定义提示词管理vercel

│   ├── chat.js             # 对话式修改功能

│   ├── download.js         # 下载功能 (xmind / PNG)# 设置环境变量

│   ├── generate.js         # 核心生成流程vercel env add OPENAI_API_KEY   # 粘贴你的 OpenAI API Key

│   └── main.js             # 入口 - 事件监听与初始化

├── index.html              # 主页面# 可选：自定义模型或使用兼容 API

├── style.css               # 样式表 (CSS 变量 + 响应式)# vercel env add OPENAI_BASE_URL  # 默认 https://api.openai.com/v1

├── xmind-export.js         # .xmind 文件生成模块# vercel env add OPENAI_MODEL     # 默认 gpt-4o

├── png-export.js           # PNG 图片导出模块

├── vercel.json             # Vercel 路由与安全头配置# 重新部署使环境变量生效

├── package.jsonvercel --prod

└── README.md```

```

#### 方式 B: 通过 GitHub

## 部署步骤

1. 将 `mindmap-website` 目录推送到 GitHub 仓库

### 方式 A: 使用 Vercel CLI2. 登录 [Vercel](https://vercel.com)，导入该仓库

3. 在 Settings → Environment Variables 中添加:

```bash   - `OPENAI_API_KEY` = 你的 OpenAI API Key

# 安装 Vercel CLI   - `OPENAI_BASE_URL` = (可选) 自定义 API 地址，兼容其他 LLM 服务

npm i -g vercel   - `OPENAI_MODEL` = (可选) 模型名称，默认 `gpt-4o`

4. 触发重新部署

# 进入项目目录

cd mindmap-website### 2. 本地开发



# 部署```bash

vercel# 安装 Vercel CLI

npm i -g vercel

# 设置环境变量

vercel env add OPENAI_API_KEY   # 粘贴你的 API Key# 进入项目目录

cd mindmap-website

# 可选：自定义模型或使用兼容 API

# vercel env add OPENAI_BASE_URL  # 默认 https://api.openai.com/v1# 创建 .env 文件

# vercel env add OPENAI_MODEL     # 默认 gpt-4oecho "OPENAI_API_KEY=sk-your-key-here" > .env



# 重新部署使环境变量生效# 启动本地开发服务器

vercel --prodvercel dev

``````



### 方式 B: 通过 GitHub访问 http://localhost:3000 即可使用。



1. 将项目推送到 GitHub 仓库## 使用流程

2. 登录 [Vercel](https://vercel.com)，导入该仓库

3. 在 Settings → Environment Variables 中添加:1. 在输入框输入思维导图主题（如「人工智能」「项目管理」）

   - `OPENAI_API_KEY` = 你的 API Key2. 点击「✨ 生成思维导图」

   - `OPENAI_BASE_URL` = (可选) 自定义 API 地址3. AI 生成后自动在页面上渲染思维导图预览

   - `OPENAI_MODEL` = (可选) 模型名称，默认 `gpt-4o`4. 可以缩放、拖动查看

4. 触发重新部署5. 点击「📥 下载 .xmind」获取 Xmind 文件（用 Xmind 软件打开）

6. 点击「🖼️ 下载 PNG」获取高清图片

### 本地开发

## 注意事项

```bash

# 创建 .env 文件- OpenAI API Key 通过 Vercel 环境变量设置，**不会**暴露在前端代码中

echo "OPENAI_API_KEY=sk-your-key-here" > .env- Serverless Function (`api/generate.js`) 作为安全代理

- 支持任何 OpenAI 兼容 API（如 DeepSeek、Moonshot 等），只需修改 `OPENAI_BASE_URL` 和 `OPENAI_MODEL`

# 启动本地开发服务器- .xmind 文件兼容 Xmind Zen / Xmind 2020+

vercel dev- PNG 导出为 2x 分辨率，适合打印和分享

```

访问 http://localhost:3000 即可使用。

## 使用流程

1. 选择 AI 模型，输入思维导图主题
2. (可选) 选择风格预设或自定义提示词
3. 点击「✨ 生成思维导图」
4. AI 生成后自动渲染预览，支持缩放和拖动
5. 使用「💬 对话修改」功能局部调整节点
6. 下载 .xmind 或 PNG 格式文件

## 架构说明

### 对话修改 (JSON Patch 模式)

对话修改采用 **局部操作** 而非全量重写，AI 返回 JSON 操作指令，前端引擎执行局部修改：

| 操作 | 说明 |
|------|------|
| `expand` | 在目标节点下插入子节点 |
| `delete` | 删除节点及其所有子节点 |
| `rename` | 重命名节点 |
| `insert` | 在目标节点后插入同级节点 |
| `replace` | 替换节点及其子树 |

节点匹配使用三级模糊匹配：精确匹配 → 包含匹配 → 反向包含（忽略 emoji）。

## 注意事项

- API Key 通过 Vercel 环境变量设置，**不会**暴露在前端代码中
- 支持任何 OpenAI 兼容 API（DeepSeek、Moonshot、Claude 等）
- .xmind 文件兼容 Xmind Zen / Xmind 2020+
- PNG 导出为 2x 分辨率，适合打印和分享
- 历史记录存储在浏览器 localStorage，最多保留 50 条
