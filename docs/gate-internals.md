# 门控逆向结论与调试方法

记录「电脑操控 / 浏览器」可用性判定链路、已确认的 gate 语义，以及为什么必须硬排除「要求更新」门控。结论来自 2026-11 对 `ChatGPT.app/Contents/Resources/app.asar` 的静态分析与运行时校验，应用更新后可能失效。

## 判定链

设置页的「不可用」徽标（文案 key `settings.browserPlugin.restrictedAvailabilityDescription`：「已被你的组织停用，或在你所在地区不可用」）只在原因命中以下两者之一时渲染：

- `statsig-disabled`
- `config-requirement-disabled`

输入是三个客户端门控，定义在 `webview/assets/async/182735.7f13786b92.js` 的可用性函数里：

| 含义 | 函数入参 | gate 哈希 |
|---|---|---|
| 电脑操控 | `isComputerUseGateEnabled`（`IIEq` → `H`） | `1506311413` |
| 外部浏览器 | `isExternalBrowserUseGateEnabled`（`jWaO` → `J`） | `410065390` |
| 内置浏览器 Agent | `isBrowserAgentGateEnabled`（`yrds` → `I`） | `410262010` |

对应的判定（压缩后原文）：

```js
// 电脑操控
n ? ... isBrowserAndComputerUseAllowed ? (isComputerUseGateEnabled ? ... : "unsupported-platform") : "statsig-disabled" : "config-requirement-disabled"
// 外部浏览器
... isExternalBrowserUseFeatureEnabled ? (isExternalBrowserUseGateEnabled ? "available" : "statsig-disabled") : "config-requirement-disabled"
// 内置浏览器 Agent
... isBrowserEnabled ? (isBrowserAgentGateEnabled ? ... : "statsig-disabled") : "browser-pane-disabled"
```

三个哈希都是 `checkGate`/`getFeatureGate` 的直接入参，没有明文 gate 名，所以插件按哈希匹配。

## 版本停用门控（必须永不强制）

`webview/assets/async/366057.08ca21677c.js` 里的路由守卫：

```js
function oJ(e) {
  ...
  if ((0, eg.Zj)("2929582856")) return (0, i.jsx)(oQ, {}); // oQ = appSunset 页面
  return children;
}
```

`oQ` 就是截图里的页面：`appSunset.title`「要求更新」+ `appSunset.body.inAppUpdate`「此应用版本已不再受支持…」。**`2929582856` 为 true 时整个应用被这个页面顶掉，任何其他门控都没有意义。**

2.0.0 起 `2929582856` 在 `main.js` 的 `DENIED` 集合里硬排除：即使旧配置里包含它，也不会强制。2.2.2 起设置界面不再展示该门控，只保留这条内部保护。

## 其它已确认哈希

- `1079089693` = `threadTimelineHistory`，来自 `182735` 里的 feature→gate 表（`x9i8` 导出），与会话时间线有关，和 CUA 无关。旧版 probe 曾误把它当关键 gate。
- `410065390` 同时出现在主进程的配置需求里（`E._U(to.Ye, "410065390")`），但可用性判定里它就是外部浏览器 gate。

## 旧 15 个候选的含义（尽力确认）

v1.x 从 bundle 调用点里挑出「缓存值为 false」的 15 个候选。它们**不是** CUA 相关门控，只是采样；下表按调用点上下文逐个确认（2026-11 版），置信度标注见「依据」：

| 哈希 | 推断含义 | 依据（压缩代码里的可读片段） |
|---|---|---|
| `1079089693` | 会话时间线历史（threadTimelineHistory） | feature→gate 表；`readThreadTimelineEnabled(){…checkGate("1079089693")}` |
| `1138821566` | 应用/连接器列表预取（true 时跳过预取） | `wlTM.$ = (e,t)=>!t && !e.checkGate("1138821566")`；消费方 `HUHI.Ad({enabled})` 是应用列表查询 |
| `1342944728` | 购物商品卡片 v2 的图片展示 | `product_card_v2` 卡片分支里 `R.checkGate("1342944728")` |
| `1613860123` | 广告控制 / 免费版关闭广告 | Ads 设置里 `"free_ads_opt_out"===feature && !…("1613860123")` |
| `1625797156` | Work 模式引导/推广（reonboarding、workCloud 判定） | `WorkReonboardingGate` 里 `y.Zj("1625797156")`；workCloud 的 rollout 判定 |
| `2200939124` | Codex Pages 功能可用性 | Pages 可用性对象：`pages_gate_loading / pages_gate_disabled / pages_gate_unavailable` |
| `224248639` | 粘贴文件 / 文件库 | `paste-file-support` 与 `web_file_library_enabled` 同时读 `checkGate("224248639")` |
| `2608972388` | DIL（模型生成 UI）诊断/渲染遥测 | 消费方 `diagnosticsEnabled: r`，`r = e.get(o.F)`，`F` 即该 gate |
| `2830112640` | 应用入口 / UTM 归因上报（true 时跳过） | `if(e.get(s.M9)?.checkGate("2830112640"))return;` 后接 utm_* 采集；appEntry 事件同理 |
| `2911503418` | 插件创作（作者功能）禁用 | `authoringDisabled: E`，`E = x.Zj("2911503418")` |
| `3097567806` | 等待首包响应 / 流式重试 | 与 `canWaitForFirstResponse`、`retry_stream_requests` 同一段 |
| `3142691021` | TPP 新手引导「个性化下一步」 | `chatgpt.tpp.onboarding.personalize.next_steps.daily_briefing.prompt…` |
| `4101895715` | 广告图片卡片展示类型（true 时关闭） | `getShouldUseImageCardDisplayTypes: () => !z.checkGate("4101895715")` |
| `4185326558` | 助手消息修订（Assistant revisions） | `assistant_revisions_enabled` layer 与该 gate 取或 |
| `665873859` | 广告控制设置（Ads controls） | Ads 设置 selector 里 `e(o.JW,"665873859")` |

注意：

- 其中若干是**反向语义**（`true` 表示关闭/跳过），例如 `1138821566`、`2830112640`、`2911503418`、`4101895715`。盲目强制可能关掉广告、归因或诊断之外的功能，所以设置页默认不勾选这些。
- 真正需要时，在设置页按上面的中文名称逐项勾选（每项后面括号里就是哈希）；不要整组全选。
- 配合 `forceAll`（所有 gate 返回 true）会在重启时打开版本停用门控 `2929582856`，直接把应用顶到「要求更新」页——这是 2.0.0 起改成分组勾选的原因。


## 实现方式

`plugin/main.js`：

1. 从 `ctx.config.enabledGates` 读出强制清单，剔除 `2929582856`
2. 从 `window.__STATSIG__` 收集客户端实例（`firstInstance`、`instance()`、`instances`）
3. 包装 `getFeatureGate`：命中时返回 `{ ...result, value: true, details: { ...details, reason: "LocalOverride" } }`
4. 包装 `checkGate`：命中时直接返回 `true`；未命中原样返回
5. 每 3 秒兜底扫描迟到或重建的客户端；配置改动走 `ctx.onConfigUpdate` 原地更新清单，不重打补丁
6. 通过 `ctx.registerSettingsPanel` 在 ChatGPT「拓展」详情页挂载设置面板；管理器的设置页另用 `settings.html`，两边清单由 `tools/check-gates.mjs` 校验一致
7. 暴露 `window.__forceCuaGates = { version, gates, patched, at }` 供诊断
8. 卸载时还原原函数（热重载/关闭拓展即恢复）

## 调试

```bash
node tools/reload.mjs   # 页面桥接 /user-scripts/reload
node tools/probe.mjs    # 哨兵 + 三个 CUA gate + 版本停用 gate 的当前值
```

手工定位工具（`app.asar` 只读）：

```bash
node tools/asar.mjs list <路径关键字>              # 列包内文件
node tools/asar.mjs grep '<文本>' --context=300    # 全包检索并映射回文件/文件内偏移
node tools/asar.mjs map <绝对字节偏移>             # grep -b 的偏移映射回文件
node tools/asar.mjs text <包内路径> <偏移> <长度>   # 读一段
node tools/asar.mjs extract <包内路径> <输出文件>
```

定位技巧：

- 文案 key 只能找到 locale 包；真正的渲染组件用 React fiber 从 DOM 反查：`<p>要求更新</p>` 的 `__reactFiber$…` 向上走，`String(fiber.type)` 里能看到压缩后的源码，`Zj("哈希")` 一目了然。
- `isComputerUseGateEnabled` 这类可读名字是压缩代码里的**函数参数名**，`grep` 能直接命中，附近就是 gate 哈希。
- 页面里有两个 `title=ChatGPT` 的 CDP 目标：主窗口 `app://-/index.html` 和 avatar overlay。用户脚本只注入主窗口；查注入状态必须选主窗口。
- 页面里可以用 `window.__codexSessionDeleteBridge("/user-scripts/reload", {})` 触发热重载。
- 失败通道：`window.__codexPlusExtensionFailures`（为空表示 `apply` 没抛错）。

### 2026-11-11 记录

- v1.x 的 `forceAll` 在重启后触发「要求更新」页。根因是 `2929582856`（appSunset）被一并强制为 true。
- 修复方式：逐项勾选 + 版本停用门控硬黑名单。重载后 `2929582856` 立即回到 `false`，页面无需重启就退出了拦截页；新配置下三个 CUA gate 仍为 `true`。
- 旧版本曾出现「注入加载了但客户端 `wrapped:false`」的现场，最可能是探针选到了 avatar overlay 窗口（有 Statsig、无用户脚本）；本次未能复现，记录备查。
- 混淆项：`market-codex-native-navigation.js` 也会包装 `getFeatureGate`（只强制它自己的 4 个 i18n 相关哈希），可能包在本插件外层。此时 `String(client.getFeatureGate)` 里看不到 `shouldForce`，以哨兵和 gate 读取结果为准。

## 边界

- 只作用于渲染进程：覆盖设置页可用性与 UI 流程；Rust app-server 自己读门控的地方不受影响，由 Statsig 磁盘缓存兜底。
- 不修改网络请求，不内联/改写 Statsig 响应；服务端区域限制（例如账号级 enforcement）仍可能让功能在真正调用时失败。
- Statsig 本地缓存：`~/Library/Application Support/Codex/Default/Local Storage/leveldb`（`statsig.cached.evaluations.*`，`hash_used: djb2`）。
- 绕过地区门控违反 OpenAI 服务条款，账号风险自行评估。
