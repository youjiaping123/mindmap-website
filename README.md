# ZevenAI Mindmap

一个面向中文场景的 AI 思维导图网站。输入主题后，服务端调用 OpenAI 兼容模型生成 Markdown 大纲，前端将其流式渲染为可交互的思维导图，并支持对话式修改、历史记录、Xmind 导出、JPEG 导出和 SVG 导出。

项目采用“静态前端 + Vercel Serverless Functions”结构，不需要传统前端构建流程。页面资源直接由 `index.html` 和浏览器端脚本驱动，AI 请求通过 `/api/*` 代理完成，避免在前端暴露密钥。

## 预览

- AI 流式生成 Markdown 思维导图
- Markmap 实时渲染与缩放/拖拽
- 对话式局部修改导图
- 多版本并行生成
- 历史记录持久化
- 导出 `.xmind` / `.jpg` / `.svg`

## 核心特性

### 1. AI 生成

- 输入任意主题，一键生成结构化思维导图
- 服务端支持 OpenAI 兼容 API，不绑定单一厂商
- 支持切换模型，前端可动态加载可用模型列表
- 支持流式输出，用户可以在结果尚未完成时看到导图持续展开

### 2. 提示词控制

- 内置 `简洁`、`详尽`、`创意` 三种预设风格
- 支持完全自定义系统提示词
- 支持查看和回填默认提示词
- 手动输入提示词时有限制长度，预设模式可承载更长内容

### 3. 多版本生成

- 可一次生成 1 到 5 个版本
- 第一个版本采用流式预览，优先保证交互反馈
- 额外版本在后台并行生成
- 生成完成后支持通过标签切换不同版本

### 4. 可视化交互

- 基于 Markmap 将 Markdown 标题转换为思维导图
- 支持缩放、拖动、自适应视口
- 支持全屏查看
- 支持节点右键操作
  - 编辑节点文本
  - 删除节点及其子树

### 5. 对话式修改

- 在已有导图基础上通过自然语言继续编辑
- 修改模式采用“AI 返回 JSON 操作指令，前端执行局部更新”的方式
- 支持的操作包括：
  - `expand`
  - `delete`
  - `rename`
  - `insert`
  - `replace`
- 对话中也支持普通问答，不必每次都触发修改

### 6. 导出能力

- 导出 `.xmind`
- 导出高清 `.jpg`
- 导出 `.svg`
- 图片导出基于当前 SVG 图谱生成，适合分享和后续编辑

### 7. 本地历史记录

- 生成结果自动保存在浏览器 `localStorage`
- 默认最多保留 50 条记录
- 支持重新载入历史导图
- 支持单条删除和全部清空

## 技术架构

### 前端

- 原生 HTML / CSS / JavaScript
- 无构建步骤
- 浏览器端模块拆分在 `js/` 目录中
- 第三方运行时依赖通过 CDN 加载

前端主要职责：

- 渲染页面与交互状态
- 流式消费 SSE
- 将 Markdown 转换为思维导图
- 执行 AI 返回的局部修改指令
- 导出 Xmind / JPEG / SVG

### 后端

- Vercel Serverless Functions
- 作为 AI 服务代理层
- 负责：
  - 校验请求参数
  - 组装系统提示词和消息
  - 调用 OpenAI 兼容接口
  - 将上游 SSE 原样转发给前端

### AI 接口模式

项目当前使用的是 OpenAI 兼容的 `chat/completions` 接口，并支持：

- 标准非流式调用
- 标准 SSE 流式调用
- 模型列表拉取
- 自定义 `baseUrl`
- 自定义默认模型

## 页面与数据流

### 生成流程

1. 用户输入主题
2. 前端向 `/api/generate` 发起请求
3. Serverless Function 调用上游模型
4. 上游 SSE 数据通过服务端转发到浏览器
5. 前端一边累积 Markdown，一边节流刷新 Markmap
6. 最终结果写入当前状态，并保存到历史记录

### 对话修改流程

1. 用户提交对话消息
2. 前端向 `/api/chat` 发送当前 Markdown 与对话历史
3. AI 判断当前请求属于：
   - 局部修改
   - 普通聊天
4. 如果返回 JSON 操作指令，前端执行局部更新
5. 如果返回普通文本，则仅作为聊天回复显示

## 技术栈

### 核心库

- [Markmap](https://markmap.js.org/)：Markdown 思维导图渲染
- [D3](https://d3js.org/)：Markmap 依赖
- [JSZip](https://stuk.github.io/jszip/)：生成 `.xmind`
### 运行平台

- Node.js `>=18`
- Vercel Functions
- 现代浏览器

### AI 服务

- OpenAI 官方接口
- 或任意 OpenAI 兼容接口

常见兼容场景：

- OpenAI
- DeepSeek
- Moonshot
- 其他支持 OpenAI 风格 `chat/completions` 的服务

## 目录结构

```text
mindmap-website/
├── api/
│   ├── _shared.js        # AI 调用公共逻辑、默认配置、SSE 转发
│   ├── chat.js           # 对话式局部修改接口
│   ├── generate.js       # 思维导图生成接口
│   └── models.js         # 模型列表接口
├── js/
│   ├── chat.js           # 对话 UI 与 SSE 消费
│   ├── constants.js      # 全局常量与默认提示词
│   ├── download.js       # Xmind / JPEG / SVG 下载
│   ├── generate.js       # 生成主流程与多版本逻辑
│   ├── history.js        # localStorage 历史记录
│   ├── main.js           # 页面初始化与全局事件
│   ├── markdown-engine.js# JSON 操作指令执行引擎
│   ├── markmap.js        # Markmap 渲染、右键菜单、节点编辑
│   ├── models.js         # 模型下拉加载
│   ├── presets.js        # 风格预设
│   ├── prompt.js         # 自定义提示词面板
│   ├── state.js          # 全局状态
│   └── ui.js             # UI 工具函数
├── index.html            # 主页面
├── style.css             # 全局样式
├── png-export.js         # SVG 转 JPEG / SVG
├── xmind-export.js       # Markdown 转 Xmind
├── vercel.json           # Vercel 配置
└── package.json          # 项目元信息
```

## 快速开始

### 1. 克隆项目

```bash
git clone <your-repo-url>
cd mindmap-website
```

### 2. 安装 Vercel CLI

```bash
npm i -g vercel
```

### 3. 配置环境变量

项目现在支持直接从根目录读取 `.env` 和 `.env.local`，用于本地调试。

推荐做法：

```bash
cp .env.example .env.local
```

最少需要配置：

```bash
OPENAI_API_KEY=你的_API_Key
```

常用本地配置示例：

```bash
OPENAI_API_KEY=你的_API_Key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
OPENAI_MODELS=gpt-4o-mini,gpt-4o
```

如果你是部署到 Vercel，再额外同步到平台环境变量：

```bash
vercel env add OPENAI_API_KEY
vercel env add OPENAI_BASE_URL
vercel env add OPENAI_MODEL
vercel env add OPENAI_MODELS
vercel env add OPENAI_MAX_TOKENS
vercel env add OPENAI_GENERATE_MAX_TOKENS
vercel env add OPENAI_CHAT_MAX_TOKENS
```

### 4. 本地运行

```bash
npm run dev
```

默认访问地址通常为：

```text
http://localhost:3000
```

### 5. 生产部署

```bash
vercel --prod
```

## 环境变量说明

| 变量名 | 必填 | 说明 |
| --- | --- | --- |
| `OPENAI_API_KEY` | 是 | 上游模型服务的 API Key |
| `OPENAI_BASE_URL` | 否 | OpenAI 兼容接口地址，默认 `https://api.openai.com/v1` |
| `OPENAI_MODEL` | 否 | 默认模型名，默认值为 `claude-sonnet-4-6` |
| `OPENAI_MODELS` | 否 | 手动指定模型列表，逗号分隔，适合某些不支持模型枚举的兼容服务 |
| `OPENAI_MAX_TOKENS` | 否 | 统一设置生成与对话的输出上限 |
| `OPENAI_GENERATE_MAX_TOKENS` | 否 | 单独设置 `/api/generate` 的输出上限 |
| `OPENAI_CHAT_MAX_TOKENS` | 否 | 单独设置 `/api/chat` 的输出上限 |
| `API_AUTH_TOKEN` | 否 | 设置后可通过请求头 `X-App-Token` 识别可信调用方 |
| `ALLOWED_ORIGINS` | 否 | 允许访问 API 的来源域名（逗号分隔） |
| `API_RATE_LIMIT_WINDOW_MS` | 否 | 限流窗口时长（毫秒），默认 `60000` |
| `API_RATE_LIMIT_GENERATE_PER_WINDOW` | 否 | `/api/generate` 每窗口请求上限，默认 `20` |
| `API_RATE_LIMIT_CHAT_PER_WINDOW` | 否 | `/api/chat` 每窗口请求上限，默认 `20` |
| `API_RATE_LIMIT_MODELS_PER_WINDOW` | 否 | `/api/models` 每窗口请求上限，默认 `60` |
| `API_DAILY_QUOTA` | 否 | 每个调用标识的每日请求上限，默认 `800` |
| `API_MAX_CUSTOM_PROMPT_LENGTH` | 否 | 普通请求下 `customPrompt` 长度上限，默认 `30000` |
| `API_MAX_CURRENT_MARKDOWN_LENGTH` | 否 | 普通请求下 `currentMarkdown` 长度上限，默认 `20000` |
| `API_MAX_CHAT_HISTORY_LENGTH` | 否 | 普通请求下 chat history 总长度上限（最近 6 条），默认 `10000` |
| `API_TRUSTED_MAX_CUSTOM_PROMPT_LENGTH` | 否 | 可信请求下 `customPrompt` 长度上限，默认 `60000` |
| `API_TRUSTED_MAX_CURRENT_MARKDOWN_LENGTH` | 否 | 可信请求下 `currentMarkdown` 长度上限，默认 `40000` |
| `API_TRUSTED_MAX_CHAT_HISTORY_LENGTH` | 否 | 可信请求下 chat history 总长度上限（最近 6 条），默认 `20000` |

### 关于 `max_tokens`

项目当前默认行为：

- 默认不主动传 `max_tokens`
- 不在项目侧硬编码限制输出长度
- 由上游模型或服务商自行决定单次最大输出

优先级如下：

1. `OPENAI_GENERATE_MAX_TOKENS` / `OPENAI_CHAT_MAX_TOKENS`
2. `OPENAI_MAX_TOKENS`
3. 如果都未配置，则请求中不传 `max_tokens`

### 关于模型列表

`/api/models` 的行为如下：

- 如果设置了 `OPENAI_MODELS`，直接使用该列表
- 否则尝试从上游拉取模型列表
- 如果拉取失败，回退到单个默认模型

建议：

- 如果你使用的兼容服务不稳定或不支持模型列表接口，直接设置 `OPENAI_MODELS`
- 这样前端模型下拉框会更稳定

示例：

```bash
OPENAI_MODELS=gpt-4o,gpt-4o-mini,deepseek-chat
```

### 关于 API 访问保护

项目现在对 `/api/generate`、`/api/chat`、`/api/models` 启用了三层保护：

- 来源校验（同源 / 允许域名）
- 限流（按路由、按窗口）
- 每日配额（内存计数，serverless 多实例下是 best-effort）

可选地，你可以给可信客户端分配 `X-App-Token`，并通过 `API_TRUSTED_MAX_*` 放宽长内容上限。

## API 说明

### `POST /api/generate`

生成思维导图大纲并以 SSE 形式返回。

可选请求头（用于可信调用方）：

```http
X-App-Token: your-token
```

请求体示例：

```json
{
  "topic": "人工智能",
  "model": "gpt-4o",
  "customPrompt": "",
  "temperature": 0.7
}
```

主要特点：

- 流式输出
- 支持自定义模型
- 支持自定义提示词
- 支持多版本生成时的不同温度参数

### `POST /api/chat`

在现有思维导图基础上执行对话式修改，或进行普通聊天。

可选请求头（用于可信调用方）：

```http
X-App-Token: your-token
```

请求体示例：

```json
{
  "currentMarkdown": "# 人工智能\n## 机器学习",
  "message": "展开机器学习节点",
  "model": "gpt-4o-mini",
  "history": []
}
```

AI 回复模式：

- 修改模式：返回 JSON 操作数组
- 聊天模式：返回普通自然语言文本

### `GET /api/models`

获取模型列表，用于填充前端下拉框。

响应示例：

```json
{
  "success": true,
  "models": ["gpt-4o", "gpt-4o-mini"],
  "default": "gpt-4o"
}
```

## 前端模块说明

### `js/generate.js`

负责：

- 发起生成请求
- 消费 SSE
- 节流更新思维导图
- 管理多版本结果

### `js/chat.js`

负责：

- 对话输入与消息列表
- 读取流式回复
- 判断回复是否为 JSON 操作指令
- 执行导图局部修改或显示普通聊天结果

### `js/markmap.js`

负责：

- 首次渲染 Markmap
- 增量更新导图
- 右键菜单
- 节点编辑与删除
- 动画曲线优化

### `js/markdown-engine.js`

负责执行 AI 返回的操作指令，是“对话修改”功能的核心执行层。

### `js/history.js`

负责：

- 历史记录持久化
- 加载已有导图
- 删除单条记录
- 清空全部记录

### `xmind-export.js`

负责将 Markdown 标题结构解析为树，再生成符合 Xmind 新版格式的 `.xmind` 压缩包。

### `png-export.js`

负责：

- 将 SVG 转换为高清 JPEG
- 内联样式以保证导出结果与页面一致
- 生成可下载的 SVG 文件

## 导出说明

### Xmind

- 根据 Markdown 结构生成节点树
- 输出 `.xmind` 压缩包
- 包含 `content.json`、`content.xml`、`metadata.json`、`manifest.json`
- 额外写入 `Thumbnails/Thumbnails.png` 预览缩略图（低分辨率，控制文件体积）

### JPEG

- 将 SVG 克隆后导出为白底 JPEG
- 默认高倍率导出，适合社交平台和文档嵌入

### SVG

- 保留矢量结构，适合无限放大和二次编辑

## UI 与交互设计

项目当前包含以下交互层：

- 深浅主题切换
- 粒子背景
- Hero 首屏
- 历史记录侧边栏
- 版本切换标签
- 全屏预览
- 节点右键编辑
- 对话消息区
- Toast 通知系统

这些能力全部由原生前端脚本维护，不依赖 React、Vue 等框架。

## 部署到 Vercel

### 方式一：CLI

```bash
npm i -g vercel
vercel
vercel env add OPENAI_API_KEY
vercel --prod
```

### 方式二：GitHub 导入

1. 将仓库推送到 GitHub
2. 在 Vercel 中导入该仓库
3. 在项目设置中添加环境变量
4. 触发部署

推荐至少添加：

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`

如果是兼容服务，建议额外添加：

- `OPENAI_MODELS`

如果你希望更强防刷能力，建议额外添加：

- `API_AUTH_TOKEN`
- `ALLOWED_ORIGINS`
- `API_DAILY_QUOTA`

## 常见问题

### 1. 页面能打开，但生成失败

优先检查：

- `OPENAI_API_KEY` 是否已配置
- `OPENAI_BASE_URL` 是否正确
- 上游服务是否兼容 `chat/completions`
- 所选模型是否真实可用

### 2. 模型列表加载失败

可能原因：

- 上游不支持模型枚举接口
- 接口地址不兼容
- 认证失败

解决建议：

- 直接设置 `OPENAI_MODELS`
- 或只使用 `OPENAI_MODEL` 作为默认模型

### 3. 输出被截断

项目现在默认不在本地强制传 `max_tokens`。如果仍被截断，通常是：

- 上游模型自身达到了输出上限
- 上游服务做了兼容层限制
- 内容过滤或服务端提前结束

前端会根据上游的 `finish_reason` 给出提示。

### 4. 为什么没有打包构建命令

因为项目当前采用原生前端结构：

- 页面由 `index.html` 直接加载
- 业务脚本由 `js/*.js` 直接运行
- 服务端逻辑由 `api/*.js` 提供

这让部署更轻，但也意味着你需要手动维护模块边界和加载顺序。

## 维护建议

如果你准备继续迭代这个项目，建议优先关注以下方向：

- README 中提到的环境变量与代码实现保持同步
- 继续整理 API 兼容性边界
- 为 `README` 中的接口示例补充真实响应样例
- 增加基础测试，特别是：
  - Markdown 操作引擎
  - SSE 解析
  - Xmind 导出结构

## 许可证

当前仓库未声明许可证。如需开源分发，建议补充 `LICENSE` 文件。
