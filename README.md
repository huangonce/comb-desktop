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

``` markdown
comb-desktop/
├── src/
│   ├── main/
│   │   └── index.ts                            # Electron 主进程
│   ├── preload/                                # 预加载脚本
│   │   ├── index.d.ts
│   │   └── index.ts
│   └── renderer/
│       └── src/                                # Vue 应用
│           ├── assets/
│           │   └── scss/                       # 全局样式
│           │       ├── quasar-variables.scss
│           │       └── variables.scss
│           ├── components/
│           ├── layouts/
│           ├── router/                         # Vue Router
│           ├── store/                          # Pinia 状态管理
│           ├── pages/                          # 页面组件
│           ├── App.vue                         # 根组件
│           ├── main.ts                         # 入口文件
│           └── env.d.ts                        # 类型声明
├── electron.vite.config.ts                     # 主配置文件
├── package.json
└── tsconfig.json

```
