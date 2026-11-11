# codex-force-cua-gates

Codex++ 拓展包「电脑操控与浏览器门控解锁」的源码仓库。它在 ChatGPT（Codex App）的渲染进程里包装 Statsig 客户端，只强制设置里勾选的门控，让设置页对「电脑操控 / 浏览器」的判定变为可用。

- 插件本体：[`plugin/`](plugin/)
- 装机：`node tools/install.mjs --link`
- 热重载：`node tools/reload.mjs`
- 自检：`node tools/probe.mjs`

> 绕过地区门控违反 OpenAI 服务条款，账号风险自行评估。本拓展只改渲染进程的本地读取，不改网络请求、不改二进制；关闭拓展即完全恢复。

## 环境

- macOS，ChatGPT.app 由 Codex++ 启动（启动参数带 `--remote-debugging-port=9229`，Codex++ 默认会带）
- Node.js ≥ 22（工具脚本用内置 `fetch` / `WebSocket`，无第三方依赖）

## 日常开发

```bash
node tools/install.mjs --link   # 软链 plugin/ → ~/.config/Codex++/user_scripts/force-cua-gates
node tools/reload.mjs           # 页面内热重载，不用重启 ChatGPT
node tools/probe.mjs            # 检查加载状态与勾选门控的读取结果
```

改 `plugin/` 里的文件后重复 `reload` + `probe`。`install.mjs` 不带参数是复制安装（发布态），`--uninstall` 移除安装；重复安装会把旧目录移到 `~/.config/Codex++/user-script-backups/`，不会误删。

### 两个设置入口

- **Codex++ 管理器** → 用户脚本 → 本拓展 → 设置：读 `plugin/settings.html`
- **ChatGPT** → 拓展 → 本拓展 → 设置：由 `plugin/settings-panel.js` 通过 `ctx.registerSettingsPanel` 挂载

两边是同一份门控清单（中文（哈希）逐项勾选）。改了哈希或名称后跑 `node tools/check-gates.mjs`（或 `npm run check:gates`）确认两份界面一致。

### 发布到 GitHub

管理器的「发布到 GitHub」用 `symlink_metadata` 检查包目录，软链会被判成「不是用户拓展包」。发布前切换成复制安装：

```bash
node tools/install.mjs          # 复制 plugin/ 到用户脚本目录（真实目录）
# 管理器里发布
node tools/install.mjs --link   # 发布完恢复软链开发模式
```

### probe 输出怎么读

- `脚本: loaded v2.2.2 …` —— Codex++ 扫描到并执行了拓展包
- `哨兵: {"patched":1,"gates":[…]}` —— 包装逻辑真的跑到了，且列出的强制清单与会话里一致
- `1506311413 / 410065390 / 410262010 … = true` —— 电脑操控、外部浏览器、内置浏览器 Agent 三项被强制
- 页面里有两个 `title=ChatGPT` 的 CDP 目标：主窗口 `app://-/index.html` 和 avatar overlay。用户脚本只注入主窗口；`probe.mjs` 只挑主窗口。

### 已确认的门控

| 哈希 | 含义 | 默认 |
|---|---|---|
| `1506311413` | 电脑操控（Computer use） | 开 |
| `410065390` | 外部浏览器 | 开 |
| `410262010` | 内置浏览器 Agent | 开 |
| `1079089693` | 会话时间线历史，与 CUA 无关 | 关 |

来源与定位过程见 [`docs/gate-internals.md`](docs/gate-internals.md)。应用更新后哈希可能变化，先用 `probe` 和 `tools/asar.mjs` 重新确认。

## 目录

```
plugin/                       Codex++ 拓展包（同步给 Codex++ 的唯一来源）
  codexpp.json                清单：id / 版本 / renderer / 设置项 schema
  main.js                     包装 Statsig 客户端
  settings-panel.js           ChatGPT「拓展」详情页里的设置面板（ctx.registerSettingsPanel）
  settings.html               Codex++ 管理器的拓展设置页
  README.md                   拓展详情页里显示的说明
  assets/icon.svg
tools/
  install.mjs                 复制或软链到 Codex++ 用户脚本目录，并写入启用项
  reload.mjs                  CDP → 页面桥接 /user-scripts/reload
  probe.mjs                   检查注入、包装与门控读取
  check-gates.mjs             校验两份设置界面的门控清单是否一致
  asar.mjs                    app.asar 只读检索：list / grep / map / text / extract
  lib/cdp.mjs                 CDP 连接与主窗口选择
docs/
  gate-internals.md           门控逆向结论、哈希来源、调试方法
  chatgpt-startup-latency.md  ChatGPT.app 启动 50 秒的排查结论（相邻问题，不属于插件）
```

## 关键约定

- 拓展 key 是**目录名**：`user:force-cua-gates`。改目录名会让 `user_scripts.json` 里的启用项失效。
- 只包装渲染进程的 `getFeatureGate` / `checkGate`；Rust app-server 侧的门控读取不受影响，靠 Statsig 本地缓存兜底。
- 强制清单来自设置页勾选：默认只开电脑操控、外部浏览器、内置浏览器 Agent 三项。内部保留一个版本停用门控的黑名单（见 [`docs/gate-internals.md`](docs/gate-internals.md)），设置界面不展示它。
- 应用大版本更新后功能若重新变灰：先 `probe`，确认 `sentinel.patched > 0` 且目标 gate 仍为 `false`，再按 [`docs/gate-internals.md`](docs/gate-internals.md) 用 `tools/asar.mjs` 重新定位判定点或对撞哈希。
