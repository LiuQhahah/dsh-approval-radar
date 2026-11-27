# dsh-approval-radar

一键抵达「正在等你审批」的 DeepSeek Harness 会话。

> 页面内的待办雷达：不依赖系统通知权限，窗口有焦点时照样工作，落地即把键盘焦点放到审批卡片上 —— Enter 通过，Esc 拒绝。

## 它解决什么问题

同时开着好几个 session（好几个浏览器 tab）时，某个 session 需要访问 project 外的路径、或者要你确认计划、或者要你回答问题 —— 它只会在**它自己那个 tab** 里弹审批卡片。你得挨个 tab 点过去看，才知道谁在等你。

DeepSeek Harness 其实已经把这件事投影到了浏览器：`@deepseek-ai/dsh-client-ui-session` 发布的 `sessionStatus` 里每个 session 都带 `pendingInteraction`。只是除了侧栏那个小黄点，没有任何地方消费它。这个插件就消费它。

和系统通知类插件的区别：通知在**窗口有焦点时通常是哑的**，而「切 tab 找人」恰好发生在窗口有焦点的时候。这个插件全程在页面里，不需要通知权限，也不会因为你在看别的 tab 就沉默。

## 装上之后你会得到

1. **右侧浮标**：只要有会话在等你，窗口右侧中部就出现一颗胶囊形徽标 —— `1 个会话在等你` / `3 个会话在等你`。点一下展开列表，每条显示会话标题、等待类型（待审批 / 待确认计划 / 待回答）、工作目录。**点任意一条，直接跳进那个会话**，并且把键盘焦点落到审批卡片上 —— 落地后直接按 Enter 通过、Esc 拒绝，不用再点一下卡片。
2. **浏览器 tab 标题带 `⚠N`**：`⚠2 修复登录 bug — DeepSeek Harness`。切 tab 之前就知道哪个 tab 要你处理。
3. **快捷键**：`⌘⇧J`（Windows 是 `Ctrl+Shift+J`）跳到下一个等你处理的会话（跳过你正在看的那个）。可在 设置 → 快捷键 里改。Linux 浏览器上没有默认值（原因见下文「换快捷键」），浮标本身仍然可用。

浮标和 tab 标题的 `⚠N` 用**同一个计数**：都只算「当前 tab 没在看的」会话。你正在看的那个会话，审批卡片本来就在眼前，不必再提示；两处口径一致，才不会出现标题写着 `⚠1` 而浮标不显示的情况。

## 安装

```bash
dsh plugin --profile web add dsh-approval-radar
```

`dsh plugin add` 会自动把包名追加进 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` 并跑 pnpm。装完重启 `dsh web`（或刷新页面）即可生效。

从源码装（改代码时用这个，改完刷新页面即热重载）：

```bash
git clone https://github.com/LiuQhahah/dsh-approval-radar.git
dsh plugin --profile web add link:"$PWD/dsh-approval-radar"
```

### 手动安装（等价）

1. 把包加进 web profile 的依赖里：
   ```jsonc
   // ~/.dsh/profiles/web/package.json
   {
     "dependencies": { "dsh-approval-radar": "^0.1.0" },
     "dsh": { "profile": { "bundles": [ /* … */, "dsh-approval-radar" ] } }
   }
   ```
2. 在 `~/.dsh/profiles/web` 下 `pnpm install`。
3. 重启 `dsh web`。

### 卸载

```bash
dsh plugin --profile web remove dsh-approval-radar
```

## 要求

- DeepSeek Harness `>= 0.2.2-rc.5`（`package.json` 的 `engines.dsh` 声明，装到更老的版本会被直接拒绝，而不是静默出错）。
- Web GUI（`dsh web` 或桌面版）。桌面版共用同一套前端，浮标与快捷键应当同样可用，但**未在桌面版实测**；系统通知不是本插件的路径。
- 不需要额外权限、不需要网络请求、不写任何文件。

## 换位置 / 换快捷键

- 位置：`client.js` 顶部 CSS 里的 `.approval-radar { top: 50%; right: 14px; }`。右下角已被 pet / whale 挂件占用，顶部是会话标题栏，底部是输入框，右侧中部是唯一常年空着的一条带。面板是 `position: absolute` 向上展开的，所以点开时胶囊本身不会移动。
- 快捷键：`client.js` 里 `SHORTCUT_ID` 对应的 `defaults`。注意 **不要给 `web:linux` 加条目**：`isWebBindingAllowed`（`dsh-client-shortcuts/src/binding.ts:96-112`）在 Linux Web 上只认 `Slash+primary`、`Comma+primary+shift`、`Period+primary+shift` 三种硬编码组合，而 `register`（`src/client/registry.ts:91`）遇到不合法 profile 会**抛异常** —— 那会让整条注册在所有平台上一起失效，不只是 Linux。官方 `settings.open` 同样没有 `web:linux` 条目。也可以装好后在设置里改。

## 实现要点

- 只读 `sessionStatus`，不改任何审批状态；审批的裁决仍然只能通过该会话的审批卡片（`PendingApproval.answer()`）完成 —— 插件只负责把你送过去。
- 宿主半侧（`index.js`）是空的：所有数据都已在浏览器里，不需要 Host 路由，不需要额外 IPC。
- 徽标挂在 `shell.overlay`（frame 级浮层，本身 click-through，条目各自 opt-in 指针事件），不与侧栏 / 右栏 / 底部栏抢座位。
- `document.title` 的处理：`dsh-client-ui-layout` 的 `DocumentTitle` 会在会话切换时重写整个标题，所以本插件把 `⚠N ` 前缀贴回剥离后的基名上。观察范围只限 `<title>` 元素本身（另有一个 `<head>` childList observer 负责在标题元素被整个替换时重挂），不监听 `<head>` 的子树内容 —— 否则样式表、`<meta>`、preload 的任何变动都会白跑一遍。自己写的那次按值识别，不触发回环。
- 纯 JS、免构建：`client.js` 直接是浏览器侧 bundle（`window.__ModuleLoader__.load`），改完文件刷新页面即生效。
- 快捷键是浮标的附加层，不是独立能力：`resolve()` 读的是浮标组件渲染时发布的行集合（`waitingSnapshot`），首帧之前为 `null`，此时快捷键直接放行。正常组合下浮标必然挂载，所以实际感知不到；但如果你把 `shell.overlay` 座位拿掉，快捷键会静默失效而不是另找数据源。

## 开发

```bash
npm test
```

两个测试都在 Node 里跑，不需要 dsh 安装，也不需要浏览器：

- `test/registrations.mjs` — 用 `node:vm` 加载 `client.js`，断言模块 id、导出、注入的服务、注册的三条 effect、双语字典、`shell.overlay` 座位、快捷键的五个 profile 与绑定、`resolve()` 的跳转目标，以及原型链污染（`kind: 'toString'`）被忽略。
- `test/render.mjs` — 用线性 hook 顺序的 React 桩渲染组件，断言胶囊文案、无待办时不渲染、行数、排序（approval → plan-review → question）与每行内容。

## 已验证

在真实 `dsh web` 实例（`http://127.0.0.1:3080`）上用 headless Chrome + CDP 走过一遍：

- 插件进入浏览器启动图（`/plugins/??…dsh-approval-radar/client.js…&rev=…` 200），样式表注入成功；
- 真实待办存在时 `document.title` 带 `⚠N` 前缀，浮标渲染在右侧中部（`x≈1243, y≈434`，1440×900 视口），文案 `1 session needs you`；
- 点开面板列出真实条目（标题 / 类型 / 工作目录），点条目后会话切换、`document.activeElement` 落在审批卡片的 `[data-approval-scroll]` 上（`insideCard: true`）——落地后 Enter/Esc 直接可用；
- `⌘⇧J` 在真实页面里触发并跳到了下一个待办会话；设置 → 键盘快捷键 里能搜到「Jump to the next session waiting for you ⇧⌘J」；
- 无待办时浮标不渲染、标题不带前缀。

## 已知边界

- `sessionStatus` 是**本页自己**从 waterfall 收到的请求投影出来的，所以徽标反映的是这个 tab 已经收到的审批请求。计数是「本 tab 没在看的那些」—— 两个 tab 各自显示的会话不同，数字就**可以不同**，而且这是对的：那个数字就是本 tab 真正能一键跳过去的会话数。
- 如果某个会话的审批请求是在这个 tab 还没连接时发出的，这个 tab 的 `sessionStatus` 里就没有它 —— 需要刷新。这是 `ui-session` 的既定行为，不是本插件能改的。
- 自动聚焦是尽力而为：卡片在跳转后一两帧才挂载，插件用 `requestAnimationFrame` 轮询到 1500ms 为止；如果那之前用户已经在某个输入框里打字，就不抢焦点。

## License

MIT
