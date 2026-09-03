# Snap + Wayland GPU 初始化失败 — 根因与已上线修复

> **状态：** 已修复并上线。有三个文件引用本文档说明其守卫为何存在 —
> `electron-builder.yaml`、`tools/afterPack.js` 与
> `build/linux/snap-wrapper.sh` — 因此本文档予以保留而非删除。（`electron/start-app.ts`
> 中的守卫也在本文覆盖范围内，但不引用本文。）删除前请用
> `grep -rn snap-wayland-gpu-fix-research` 重新推导引用方列表；不要信任本行。
>
> **快照：** 2026-04-21。2026-04 的调查日志（18 节审查轮次、方案分析、现场数据分诊与多智能体验证）
> 在结论落地到代码后已移除 — 可用
> `git show 07511ab45c:docs/research/snap-wayland-gpu-fix-research.md` 恢复。
>
> **相关 Issue：** #5672、#7270，PR #7273。**移除条件：** 见
> [移除条件](#removal-conditions)。

## 根因

部分 Snap 用户在启动时会遇到 GPU 初始化失败：只有托盘图标没有窗口、段错误，或大量 GL 错误。

原因是 **Mesa ABI 漂移**，而非缺少文件。`libgl1-mesa-dri` 存在于
`gnome-42-2204` content snap 中，但其附带的 Mesa（经
`core22-mesa-backports` PPA）并不能可靠匹配近期 Electron Chromium 构建所期望的
Mesa/libgbm ABI。典型特征是
`"DRI driver not from this Mesa build"`。

2025 年末真正变化的是暴露面，而非这个 bug 本身：**Chromium 140（2025 年 8 月）
将 `--ozone-platform-hint` 翻转为 `auto`**，Electron ≥ 38 继承了该行为。Electron
现在在任意 Wayland 会话中都会作为原生 Wayland 客户端运行
（`XDG_SESSION_TYPE=wayland`），因此那些此前一直默默跑在 X11 上 —
从而默默避开该不匹配 — 的用户，被推到了失败路径上。

## 已上线修复：经 afterPack 包装脚本注入 argv

`tools/afterPack.js` 在构建时将主 Electron 二进制重命名为
`superproductivity-bin`，并把 `build/linux/snap-wrapper.sh`
安装到原名称下。包装脚本在启动时决定是否向 argv 注入
`--ozone-platform=x11`：

```sh
if [ -n "$IS_OUR_SNAP" ] && [ -z "$HAS_OZONE_PLATFORM" ] && { [ "$XDG_SESSION_TYPE" = "wayland" ] || [ -n "$WAYLAND_DISPLAY" ]; }; then
  exec "$BIN" --ozone-platform=x11 "$@"
fi
exec "$BIN" "$@"
```

四个属性很关键：

1. **Argv 级别。** 该标志在 Electron 或 Chromium 启动前就位于 `process.argv[1]` —
   对 Ozone 何时读取命令行没有歧义。
2. **门控在「我们的」Snap 加上 Wayland。** 门控要求
   `$SNAP_NAME = "superproductivity"`，而不仅仅是 `$SNAP` 已设置，因此经兄弟 snap 的
   `xdg-open` 启动的 `.deb`/`.rpm` 安装（`$SNAP` 会泄漏到子进程环境）不受影响。X11
   会话与非 Snap 的 Linux 目标原样透传。
3. **用户覆盖优先。** 若 argv 已携带 `--ozone-platform=...`，包装脚本透传。扫描在
   `--` 处停止。
4. **能经受 `app.relaunch()`。** `IPC.RELAUNCH` 将 `execPath` 指向同级包装脚本；否则
   Electron 会直接 relaunch 重命名后的 ELF 并丢失注入。见
   `electron/ipc-handlers/app-control.ts`。

同行先例：`snapcrafters/signal-desktop` 与
`snapcrafters/mattermost-desktop` 以 command-chain 脚本采用相同形态。我们的放在
`afterPack` 里，是因为 electron-builder 每次构建都会重新生成 `snapcraft.yaml`。

### 为何不用 `linux.executableArgs`

electron-builder 会忽略 `snap.executableArgs`
（[electron-builder#4587](https://github.com/electron-userland/electron-builder/issues/4587)），
即便它能用，也会把该标志烘焙进 X11 会话。包装脚本是运行时条件判断。

### 机制 — 为何此处 `appendSwitch` 行不通

_（原报告中别处引用为 §18.7。）_

CLI 标志与 `appendSwitch` 的分歧是 **严格的初始化顺序**，而非时机或环境交互。相对
Electron 与 Chromium 源码在 2026-04-21 的追踪（约 85% 把握；剩余不确定的是：迟来的父进程侧
`appendSwitch` 是否仍会传播到 GPU _子_ 进程 — 从未从源码验证，这可以解释部分成功的现场报告 —
但不改变结论）：

1. Electron 的 C++ `ElectronBrowserMainParts::PreEarlyInitialization()` 调用
   `SetOzonePlatformForLinuxIfNeeded(*base::CommandLine::ForCurrentProcess())`，
   然后是 `ui::OzonePlatform::PreEarlyInitialization()`
   （[electron#48301](https://github.com/electron/electron/pull/48301/files)）。
2. 该方法从当前命令行读取 `--ozone-platform`，解析平台，并记忆到静态
   `g_selected_platform`
   （[ui/ozone/platform_selection.cc](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/ui/ozone/platform_selection.cc)）。
3. V8 稍后在 `PostEarlyInitialization()` 期间加载 `main.js`。
4. `app.commandLine.appendSwitch('ozone-platform', 'x11')` 随后写入一个
   **再也没人读的** 值。

因此没有任何 Electron 主进程 JS 能影响 Ozone 平台选择。从二进制外部注入 argv
在结构上是唯一修复。

已拒绝的替代方案：

- `ELECTRON_OZONE_PLATFORM_HINT` — 在 Electron 39 中作为死代码移除
  （[electron#47983](https://github.com/electron/electron/pull/47983)）。
- 在 `start-app.ts` 中于 `require('electron')` 之前设置该环境变量 — C++
  `main()` 在任何 JS 运行前已走过 `PreEarlyInitialization`。
- 在 electron-builder 的 `snap.environment:` 中设置 `XDG_SESSION_TYPE=x11` — 会生效，
  但 `IdleTimeHandler` 读取 `XDG_SESSION_TYPE` 以选择空闲检测方法，因此这会静默破坏
  GNOME Wayland 空闲检测。

### 为何 `start-app.ts` 中的程序化守卫仍保留

`start-app.ts` 中还有两处也会追加 `--ozone-platform=x11`，且两者仍在承重：

- **主动 Snap 块** 在 `$SNAP` 已设置且会话为 Wayland _或_ `gnome-platform` 为空时，
  将范围扩大到 X11。缺失 `gnome-platform` 这一支没有包装脚本等价物 — 包装脚本只检查会话 —
  因此这里覆盖了 argv 注入覆盖不到的情况。
- **反应式 GPU 启动守卫**（来自 PR #7273 的崩溃标记路径）将该标志与
  `--disable-gpu` 和 `--disable-software-rasterizer` 叠加。Flatpak 与其他非 Snap
  Wayland 宿主完全没有包装脚本，因此在那里这是唯一设置它的地方。

在 Snap+Wayland 上，包装脚本使两者都变得多余，但这无害：重复的
`--ozone-platform` 按 last-wins 解析。注意 last-wins 是 **经验性的，并非文档约定** —
  在 2026-04 测试的每个 Chromium 版本中都成立，但不是契约。**在 Electron 大版本升级后应重新验证。**
  移除这两处守卫无论如何都会使上述情况回退。

## 已知缺口：没有人验证包装脚本是否在构建产物中

`afterPack` 钩子可能在 CI 中静默失败，直到用户报告崩溃才有人发现。
`tools/verify-linux-wm-class.test.js` 并未堵住这一点 — 它只断言静态字符串一致
（`BIN_NAME` 匹配 `executableName`，包装脚本引用 `RENAMED`）；从不检查真实构建输出。

2026-04 提出且 **仍未实现** 的修复：在 `npm run dist -- -l` 之后，
若 Linux `appOutDir` 中缺少 `superproductivity-bin` 则使构建失败。

## 移除条件

在以下任一成立时退役包装脚本：

- **Snap 迁移到 core24 + `gpu-2404`。** 这会解决 Mesa ABI 漂移，Wayland 路径重新可用。
  注意迁移后包装脚本本身成本为零 — X11 回退只在我们的 `$SNAP` 下触发 — 因此迁移允许移除，
  而非要求移除。
- **Chromium 的 argv/`appendSwitch` 分歧在上游修复。** 不太可能：§18.7 的追踪表明该分歧是结构性的
  （一次在 JS 之前发生的记忆化读取），而非等待补丁的 bug。
