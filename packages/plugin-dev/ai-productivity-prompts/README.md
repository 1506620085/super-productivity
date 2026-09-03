# Procrastination Buster 插件

一款 Super Productivity 插件，帮助识别拖延障碍，并提供针对性策略加以克服。

## 功能

- 🎯 识别 8 种不同的拖延类型
- 💡 为每种类型提供针对性策略
- ⏱️ 可直接从策略启动番茄钟计时器
- ➕ 将策略添加为任务
- 🌓 使用 CSS 变量支持深色模式

## 安装

### 开发

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Create plugin ZIP
npm run package
```

### 在 Super Productivity 中使用

1. 运行 `npm run build`
2. 在 Super Productivity 中上传生成的 `dist/plugin.zip`
3. 或将 `dist` 文件夹复制到 `src/assets/procrastination-buster/`

## 用法

1. **快捷键**：使用键盘快捷键快速打开
2. **侧栏**：通过侧栏打开插件
3. **自动**：在某个任务上闲置 15 分钟后

## 拖延类型

1. **Overwhelm** - 「一下子太多了」
2. **Perfectionism** - 「还不够完美」
3. **Unclear** - 「不知道该做什么」
4. **Boredom** - 「太无聊了」
5. **Fear** - 「可能会失败」
6. **Low Energy** - 「我太累了」
7. **Distraction** - 「别的事情更有趣」
8. **Resistance** - 「我不想做这个」

## 技术

- **SolidJS** 用于响应式 UI
- **Vite** 用于快速开发与构建
- **TypeScript** 用于类型安全
- **Super Productivity Plugin API**
- **CSS Variables** 用于主题集成

## 开发

插件由两部分组成：

1. **plugin.ts** - 与 Super Productivity 通信的后端逻辑
2. **SolidJS App** - iframe 中的前端 UI

### 项目结构

```
procrastination-buster/
├── src/
│   ├── plugin.ts         # Plugin backend
│   ├── App.tsx          # Main component
│   ├── types.ts         # TypeScript definitions
│   ├── BlockerSelector.tsx
│   └── StrategyList.tsx
├── manifest.json        # Plugin metadata
├── index.html          # HTML entry
└── vite.config.ts      # Build configuration
```

## 自定义

### 添加新策略

编辑 `src/types.ts`，向相应类型添加新策略。

### 样式自定义

编辑 `src/App.css` 调整外观。插件使用 CSS 变量以实现无缝主题集成：

- `--primary-color` - 主主题色
- `--text-color` - 主文本色
- `--background-color` - 背景
- `--card-background` - 卡片背景
- `--border-radius` - 标准圆角
- 以及更多……

## 许可证

MIT
