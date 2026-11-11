#!/usr/bin/env node
// 校验仓库根目录的 codexpp.json 是否与 plugin/codexpp.json 同步，
// 以及清单里引用的 renderer / 设置页 / 图标是否真实存在。
//
// 用法：node tools/check-manifests.mjs
// 不同步时运行 node tools/sync-root-manifest.mjs 重新生成。

import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plugin = JSON.parse(await readFile(path.join(repoRoot, "plugin/codexpp.json"), "utf8"));
const root = JSON.parse(await readFile(path.join(repoRoot, "codexpp.json"), "utf8"));

const prefix = (value) => (typeof value === "string" && value ? path.posix.join("plugin", value) : value);
const expected = structuredClone(plugin);
if (expected.icon) expected.icon = prefix(expected.icon);
if (expected.renderer) {
  expected.renderer = Array.isArray(expected.renderer)
    ? expected.renderer.map(prefix)
    : prefix(expected.renderer);
}
if (expected.settings?.page) expected.settings.page = prefix(expected.settings.page);

try {
  assert.deepEqual(root, expected);
} catch {
  console.error("根目录 codexpp.json 与 plugin/codexpp.json 不同步；运行 node tools/sync-root-manifest.mjs");
  process.exit(1);
}

const referenced = [
  root.icon,
  ...(Array.isArray(root.renderer) ? root.renderer : root.renderer ? [root.renderer] : []),
  root.settings?.page,
].filter(Boolean);

for (const relative of referenced) {
  if (path.isAbsolute(relative) || relative.split("/").includes("..")) {
    console.error(`清单路径必须是包内相对路径：${relative}`);
    process.exit(1);
  }
  try {
    await access(path.join(repoRoot, relative));
  } catch {
    console.error(`清单引用的文件不存在：${relative}`);
    process.exit(1);
  }
}

console.log(`根清单与 plugin 清单同步，引用文件存在（${referenced.length} 个）`);
