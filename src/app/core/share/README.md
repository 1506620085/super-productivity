# Share 组件

Super Productivity 的多平台分享功能。

## 概览

本模块提供可在所有平台复用的分享系统：

- **桌面（Electron）**：通过 shell 在浏览器中打开分享 URL
- **移动（Android）**：在可用时使用 Capacitor Share 插件
- **Web（PWA）**：在可用时使用 Web Share API
- **回退**：带各社交平台 intent URL 的 Material 对话框

## 快速开始

### 基本用法

```typescript
import { ShareService } from './core/share/share.service';
import { ShareFormatter } from './core/share/share-formatter';

// In your component
constructor(private shareService: ShareService) {}

async shareWorkSummary() {
  const payload = ShareFormatter.formatWorkSummary({
    totalTimeSpent: 3600000, // 1 hour in ms
    tasksCompleted: 5,
    dateRange: {
      start: '2024-01-01',
      end: '2024-01-07',
    },
  }, {
    includeUTM: true,
    includeHashtags: true,
  });

  await this.shareService.share(payload);
}
```

### 使用分享按钮组件

```html
<share-button
  [payload]="mySharePayload"
  tooltip="Share your achievements"
/>
```

```typescript
// In component
import { ShareButtonComponent } from './core/share/share-button/share-button.component';
import { ShareFormatter } from './core/share/share-formatter';

@Component({
  imports: [ShareButtonComponent],
  // ...
})
export class MyComponent {
  readonly sharePayload = ShareFormatter.formatWorkSummary({
    totalTimeSpent: this.totalTime,
    tasksCompleted: this.completedTaskCount,
  });
}
```

## API 参考

### ShareService

分享内容的主服务。

#### 方法

- `share(payload: SharePayload, target?: ShareTarget): Promise<ShareResult>`

  - 主分享方法，自动检测平台并使用最佳方式
  - 若指定 target，则直接分享到该目标
  - 否则先尝试原生分享，再显示对话框

- `getShareTargets(): ShareTargetConfig[]`
  - 返回可用分享目标及其配置的列表

### ShareFormatter

将内容格式化为可分享载荷的工具类。

#### 方法

- `formatWorkSummary(data: WorkSummaryData, options?: ShareFormatterOptions): SharePayload`

  - 将工作统计格式化为可分享文本，含耗时、已完成任务等

- `formatPromotion(customText?: string, options?: ShareFormatterOptions): SharePayload`

  - 创建用于推广应用的分享载荷

- `optimizeForTwitter(payload: SharePayload): SharePayload`
  - 截断文本以适配 Twitter 字符限制

### SharePayload 接口

```typescript
interface SharePayload {
  text?: string; // Main text content
  url?: string; // URL to share
  title?: string; // Optional title (used by Reddit, Email)
  files?: string[]; // Optional file paths for native share (future use)
}
```

### ShareTarget 类型

支持的分享目标：

- `twitter` - Twitter/X
- `linkedin` - LinkedIn
- `reddit` - Reddit
- `facebook` - Facebook
- `whatsapp` - WhatsApp
- `telegram` - Telegram
- `email` - Email
- `mastodon` - Mastodon（支持自定义实例）
- `clipboard-text` - 将格式化文本复制到剪贴板
- `native` - 使用原生 OS 分享面板

## 平台支持

### 桌面（Electron）

- 使用 `shell.openExternal()` 打开分享 URL
- 原生分享处理器已预留桩（为 macOS/Windows 原生实现就绪）
- IPC 事件：`SHARE_NATIVE`

### 移动（经 Capacitor 的 Android）

- 运行时通过 `window.Capacitor?.Plugins?.Share` 检查 Capacitor Share 插件
- 无需构建时依赖
- 若未安装插件则优雅回退

### Web（PWA/浏览器）

- 可用时使用 Web Share API
- 回退到带 intent URL 的分享对话框

## 架构

### 文件结构

```
src/app/core/share/
├── share.model.ts                 # TypeScript interfaces
├── share-formatter.ts             # Work summary formatter
├── share-formatter.spec.ts        # Formatter tests
├── share.service.ts               # Main share service
├── share.service.spec.ts          # Service tests
├── dialog-share/                  # Material dialog component
│   ├── dialog-share.component.ts
│   ├── dialog-share.component.html
│   └── dialog-share.component.scss
└── share-button/                  # Reusable button component
    └── share-button.component.ts
```

### Electron 集成

```
electron/
├── shared-with-frontend/
│   └── ipc-events.const.ts       # Added SHARE_NATIVE event
├── electronAPI.d.ts              # Added shareNative method
├── preload.ts                    # Exposed shareNative to renderer
└── ipc-handler.ts                # IPC handler (fallback stub)
```

## 未来增强

### 原生 OS 分享实现

Electron IPC 处理器目前返回回退错误。要实现真正的原生分享：

#### macOS

使用 `NSSharingServicePicker` 创建 Swift/Objective-C 桥接：

```swift
import Cocoa

@objc class ShareHelper: NSObject {
    @objc static func share(text: String, url: String, files: [String]) {
        let items = [text, URL(string: url)!] + files.map { URL(fileURLWithPath: $0) }
        let picker = NSSharingServicePicker(items: items)
        // Show picker at mouse location
    }
}
```

#### Windows

使用 WinRT `DataTransferManager` 创建 C#/C++ 桥接：

```csharp
using Windows.ApplicationModel.DataTransfer;

var dataTransferManager = DataTransferManager.GetForCurrentView();
dataTransferManager.DataRequested += (sender, args) => {
    args.Request.Data.SetText(text);
    args.Request.Data.SetWebLink(new Uri(url));
};
DataTransferManager.ShowShareUI();
```

### 安装 Capacitor 插件

要启用原生 Android 分享，安装 Capacitor Share 插件：

```bash
npm install @capacitor/share
```

服务会在可用时自动检测并使用它。

## 测试

单元测试覆盖：

- `share-formatter.spec.ts` - 测试格式化逻辑
- `share.service.spec.ts` - 测试服务方法与 URL 构建

运行测试：

```bash
npm test
```

## 贡献

添加新分享目标时：

1. 在 `share.model.ts` 的 `ShareTarget` 类型中添加目标
2. 在 `share.service.ts` 的 `_buildShareUrl()` 中添加 URL 构建器
3. 在 `dialog-share.component.ts` 的 `shareTargets` 数组中添加按钮配置
4. 在 `share.service.spec.ts` 中添加测试

## 许可证

Super Productivity 的一部分——见主项目 LICENSE。
