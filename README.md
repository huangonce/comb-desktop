# comb-desktop

An Electron application with Vue and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)

## Project Setup

### Install

```bash
$ pnpm install
```

### Development

```bash
$ pnpm dev
```

### Build

```bash
# For windows
$ pnpm build:win

# For macOS
$ pnpm build:mac

# For Linux
$ pnpm build:linux
```

```markdown
comb-desktop/
├── src/
│ ├── main/
│ │ ├── index.ts # Electron 主进程
│ │ ├── services/ # 业务服务
│ │ │ ├── alibaba.service.ts # 阿里巴巴采集服务
│ │ │ ├── logger.service.ts # 日志服务
│ │ │ └── update.service.ts # 更新服务
│ │ └── windows/ # 窗口管理
│ ├── preload/ # 预加载脚本
│ │ ├── index.d.ts
│ │ └── index.ts
│ ├── renderer/
│ │ └── src/ # Vue 应用
│ │ ├── assets/
│ │ │ └── scss/ # 全局样式
│ │ ├── components/
│ │ ├── layouts/
│ │ ├── router/ # Vue Router
│ │ ├── stores/ # Pinia 状态管理
│ │ ├── pages/ # 页面组件
│ │ │ └── dashboard/
│ │ │ └── collect/
│ │ │ └── AlibabaView.vue # 阿里巴巴采集页面
│ │ ├── App.vue # 根组件
│ │ ├── main.ts # 入口文件
│ │ └── env.d.ts # 类型声明
│ └── shared/ # 共享代码
│ └── ipc-channels.ts # IPC通道定义
├── scripts/ # 测试和分析脚本
│ ├── analyze-page.js # 页面结构分析
│ ├── test-alibaba.js # 基础功能测试
│ ├── test-captcha.js # 验证码处理测试
│ ├── test-selectors.js # 选择器测试
│ └── README.md # 脚本文件说明
├── electron.vite.config.ts # 主配置文件
├── package.json
└── tsconfig.json
```

## 功能特性

### 阿里巴巴供应商信息采集

- 使用Playwright自动化浏览器进行数据采集
- 支持关键词搜索供应商
- 提取供应商详细信息（公司名称、联系方式、地址等）
- 防反爬虫机制，智能处理验证码
- 实时进度显示和错误处理

### 开发和测试

- `scripts/` 文件夹包含了完整的测试脚本
- 支持页面结构分析和选择器调试
- 详细的日志记录和错误处理

## 运行测试

```bash
# 分析阿里巴巴页面结构
node scripts/analyze-page.js

# 测试基础采集功能
node scripts/test-alibaba.js

# 测试验证码处理
node scripts/test-captcha.js

# 测试页面选择器
node scripts/test-selectors.js
```

npx electron-builder build --win --publish always
