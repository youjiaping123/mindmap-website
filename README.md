# AI 思维导图生成器

输入主题，AI 自动生成思维导图。支持在线预览、下载 .xmind 文件和 PNG 图片。

## 技术栈

- **AI**: [OpenAI API](https://platform.openai.com/) (GPT-4o)
- **思维导图渲染**: [Markmap](https://markmap.js.org/) (Markdown → SVG)
- **.xmind 导出**: [JSZip](https://stuk.github.io/jszip/) (生成 Xmind 兼容文件)
- **PNG 导出**: SVG → Canvas → PNG
- **部署**: [Vercel](https://vercel.com) (免费静态托管 + Serverless Functions)

## 项目结构

```
mindmap-website/
├── api/
│   └── generate.js       # Vercel Serverless Function (调用 OpenAI API)
├── index.html            # 主页面
├── style.css             # 样式
├── app.js                # 主逻辑 (渲染、交互)
├── xmind-export.js       # .xmind 文件生成模块
├── png-export.js         # PNG 图片导出模块
├── vercel.json           # Vercel 配置
├── package.json
└── README.md
```

## 部署步骤

### 1. 部署到 Vercel

#### 方式 A: 使用 Vercel CLI

```bash
# 安装 Vercel CLI
npm i -g vercel

# 进入项目目录
cd mindmap-website

# 部署
vercel

# 设置环境变量
vercel env add OPENAI_API_KEY   # 粘贴你的 OpenAI API Key

# 可选：自定义模型或使用兼容 API
# vercel env add OPENAI_BASE_URL  # 默认 https://api.openai.com/v1
# vercel env add OPENAI_MODEL     # 默认 gpt-4o

# 重新部署使环境变量生效
vercel --prod
```

#### 方式 B: 通过 GitHub

1. 将 `mindmap-website` 目录推送到 GitHub 仓库
2. 登录 [Vercel](https://vercel.com)，导入该仓库
3. 在 Settings → Environment Variables 中添加:
   - `OPENAI_API_KEY` = 你的 OpenAI API Key
   - `OPENAI_BASE_URL` = (可选) 自定义 API 地址，兼容其他 LLM 服务
   - `OPENAI_MODEL` = (可选) 模型名称，默认 `gpt-4o`
4. 触发重新部署

### 2. 本地开发

```bash
# 安装 Vercel CLI
npm i -g vercel

# 进入项目目录
cd mindmap-website

# 创建 .env 文件
echo "OPENAI_API_KEY=sk-your-key-here" > .env

# 启动本地开发服务器
vercel dev
```

访问 http://localhost:3000 即可使用。

## 使用流程

1. 在输入框输入思维导图主题（如「人工智能」「项目管理」）
2. 点击「✨ 生成思维导图」
3. AI 生成后自动在页面上渲染思维导图预览
4. 可以缩放、拖动查看
5. 点击「📥 下载 .xmind」获取 Xmind 文件（用 Xmind 软件打开）
6. 点击「🖼️ 下载 PNG」获取高清图片

## 注意事项

- OpenAI API Key 通过 Vercel 环境变量设置，**不会**暴露在前端代码中
- Serverless Function (`api/generate.js`) 作为安全代理
- 支持任何 OpenAI 兼容 API（如 DeepSeek、Moonshot 等），只需修改 `OPENAI_BASE_URL` 和 `OPENAI_MODEL`
- .xmind 文件兼容 Xmind Zen / Xmind 2020+
- PNG 导出为 2x 分辨率，适合打印和分享
