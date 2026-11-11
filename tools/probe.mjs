#!/usr/bin/env node
// 检查 force-cua-gates 在主窗口里的加载、包装与门控读取结果。
//
// 用法：
//   node tools/probe.mjs            # 人类可读摘要
//   node tools/probe.mjs --json     # 原始 JSON，便于二次处理
//
// 退出码：0 表示脚本已加载、勾选的 gate 都返回 true，且版本停用 gate 没被强制；
// 1 表示没有页面或结果不符合预期。

import { connect, endpoint, findMainPage } from "./lib/cdp.mjs";

// 2026-11 版语义；应用更新后按 docs/gate-internals.md 重新确认。
const GATES = [
  { hash: "1506311413", name: "电脑操控", expected: true },
  { hash: "410065390", name: "外部浏览器", expected: true },
  { hash: "410262010", name: "内置浏览器 Agent", expected: true },
  { hash: "1079089693", name: "会话时间线历史（与本插件无关）", expected: false },
  { hash: "2929582856", name: "应用版本停用（必须为 false）", expected: false },
];
const HASHES = GATES.map((gate) => gate.hash);
const SUNSET = "2929582856";
const SCRIPT_KEY = "user:force-cua-gates";

const page = await findMainPage();
if (!page) {
  console.error(`没有找到 ChatGPT 主窗口（CDP: ${endpoint}）。请由 Codex++ 启动 ChatGPT，或检查 9229 端口。`);
  process.exit(1);
}

const session = await connect(page);
const report = await session.evaluate(`(() => {
  const hashes = ${JSON.stringify(HASHES)};
  const scripts = window.__codexPlusUserScripts?.scripts || {};
  const entry = scripts[${JSON.stringify(SCRIPT_KEY)}] || null;
  const root = window.__STATSIG__;
  const instances = root
    ? [...new Set([
        root.firstInstance,
        typeof root.instance === "function" ? root.instance() : null,
        ...Object.values(root.instances || {}),
      ].filter(Boolean))]
    : [];
  const isOurs = (fn) => /shouldForce/.test(String(fn));
  const gates = {};
  for (const name of hashes) {
    const client = instances[0];
    if (!client) break;
    let result = null;
    try {
      result = typeof client.getFeatureGate === "function" ? client.getFeatureGate(name) : null;
    } catch (error) {
      gates[name] = { error: String(error) };
      continue;
    }
    gates[name] = {
      value: result?.value,
      reason: result?.details?.reason ?? null,
      checkGate: typeof client.checkGate === "function" ? client.checkGate(name) : null,
    };
  }
  return {
    url: location.href,
    sentinel: window.__forceCuaGates ?? null,
    script: entry ? { status: entry.status, error: entry.error, loadedAt: entry.loadedAt, version: entry.manifest?.version } : null,
    failures: window.__codexPlusExtensionFailures ?? null,
    statsig: root ? { instanceCount: instances.length, wrappedCheck: instances.map((client) => isOurs(client.checkGate)) } : null,
    gates,
  };
})()`);
session.close();

const enabled = report.sentinel?.gates ?? [];
const valueOf = (hash) => report.gates?.[hash]?.value;
const notForced = enabled.filter((hash) => valueOf(hash) !== true);
const sunsetForced = valueOf(SUNSET) === true || report.gates?.[SUNSET]?.reason === "LocalOverride";
const effective = Boolean(report.sentinel?.patched) && notForced.length === 0 && !sunsetForced;
const asJson = process.argv.includes("--json");

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const script = report.script;
  console.log(`页面: ${report.url}`);
  console.log(`脚本: ${script ? `${script.status}  v${script.version}  ${script.loadedAt}` : "未加载（检查 user_scripts.json 里 user:force-cua-gates 是否启用）"}`);
  console.log(`哨兵: ${report.sentinel ? JSON.stringify(report.sentinel) : "未设置 —— 脚本没执行到包装逻辑"}`);
  console.log(`Statsig: ${report.statsig ? `${report.statsig.instanceCount} 个实例` : "没有 window.__STATSIG__"}`);
  const rows = GATES.map((gate) => {
    const info = report.gates?.[gate.hash] || {};
    const mark = gate.expected ? "应开启" : "应关闭";
    return `  ${gate.hash}  ${gate.name}  value=${info.value}  reason=${info.reason ?? "-"}  checkGate=${info.checkGate}  (${mark})`;
  });
  console.log(`门控:\n${rows.join("\n")}`);
  if (report.failures) console.log(`注入失败: ${JSON.stringify(report.failures)}`);
  if (sunsetForced) console.log("危险: 2929582856（应用版本停用）为 true，ChatGPT 会停在「要求更新」页。");
  if (notForced.length) console.log(`未生效的勾选项: ${notForced.join(", ")}`);
  console.log(
    effective
      ? `结论: 生效（包装 ${report.sentinel.patched} 个客户端，版本停用 gate 保持 false）`
      : "结论: 未生效",
  );
}

process.exit(effective ? 0 : 1);
