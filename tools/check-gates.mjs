#!/usr/bin/env node
// 校验两个设置界面里的门控清单是否一致：
// - 管理器设置页 plugin/settings.html
// - ChatGPT「拓展」详情页设置面板 plugin/settings-panel.js
//
// 同时确认 main.js 里保留了版本停用门控的黑名单（设置界面不再展示它）。
//
// 用法：node tools/check-gates.mjs

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = ["plugin/settings.html", "plugin/settings-panel.js"];
const hidden = "2929582856";

const sets = new Map();
for (const file of files) {
  const text = await readFile(path.join(repoRoot, file), "utf8");
  const hashes = new Set(text.match(/\b\d{7,10}\b/g) || []);
  sets.set(file, hashes);
}

const [first, second] = files;
const a = sets.get(first);
const b = sets.get(second);
const onlyA = [...a].filter((hash) => !b.has(hash)).sort();
const onlyB = [...b].filter((hash) => !a.has(hash)).sort();

console.log(`${first}: ${a.size} 个哈希`);
console.log(`${second}: ${b.size} 个哈希`);

if (onlyA.length || onlyB.length) {
  if (onlyA.length) console.log(`只在 ${first}：${onlyA.join(" ")}`);
  if (onlyB.length) console.log(`只在 ${second}：${onlyB.join(" ")}`);
  process.exit(1);
}

const shown = [first, second].filter((file) => sets.get(file).has(hidden));
if (shown.length) {
  console.error(`设置界面不应再展示 ${hidden}：${shown.join("、")}`);
  process.exit(1);
}

const main = await readFile(path.join(repoRoot, "plugin/main.js"), "utf8");
if (!main.includes(`"${hidden}"`)) {
  console.error(`main.js 的版本停用黑名单丢了（应保留 ${hidden} 作为防误开保护）`);
  process.exit(1);
}

console.log(`两份设置界面的门控清单一致；${hidden} 仅保留在 main.js 黑名单里`);
