#!/usr/bin/env node
// 通过页面内的 Codex++ 桥接热重载用户脚本，不用重启 ChatGPT。
// 拓展用 codexPlus.extension 注册了清理函数时会在原页面重载；否则 Codex++ 回退为刷新页面。

import { connect, endpoint, findMainPage } from "./lib/cdp.mjs";

const page = await findMainPage();
if (!page) {
  console.error(`没有找到 ChatGPT 主窗口（CDP: ${endpoint}）。`);
  process.exit(1);
}

const session = await connect(page);
const result = await session.evaluate(`(async () => {
  const bridge = window.__codexSessionDeleteBridge;
  if (typeof bridge !== "function") return { bridge: false };
  try {
    return { bridge: true, result: await bridge("/user-scripts/reload", {}) };
  } catch (error) {
    return { bridge: true, error: String(error) };
  }
})()`);
session.close();

if (!result.bridge) {
  console.error("页面里没有 __codexSessionDeleteBridge，请在管理器里点「热重载脚本」。");
  process.exit(1);
}
if (result.error) {
  console.error(`热重载失败：${result.error}`);
  process.exit(1);
}
const summary = result.result?.status || result.result?.message || "ok";
console.log(`热重载请求已发出：${summary}`);
console.log("下一步: node tools/probe.mjs");
