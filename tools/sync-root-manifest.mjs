#!/usr/bin/env node
// 由 plugin/codexpp.json 生成仓库根目录的 codexpp.json。
// 根清单让整个仓库可以作为一个拓展包被社区安装（renderer / 设置页 / 图标都指到 plugin/ 下）。
// 改完 plugin/codexpp.json 后运行：node tools/sync-root-manifest.mjs

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginPath = path.join(repoRoot, "plugin", "codexpp.json");
const rootPath = path.join(repoRoot, "codexpp.json");

const plugin = JSON.parse(await readFile(pluginPath, "utf8"));
const prefix = (value) => (typeof value === "string" && value ? path.posix.join("plugin", value) : value);

const root = structuredClone(plugin);
if (root.icon) root.icon = prefix(root.icon);
if (root.renderer) {
  root.renderer = Array.isArray(root.renderer)
    ? root.renderer.map(prefix)
    : prefix(root.renderer);
}
if (root.settings?.page) root.settings.page = prefix(root.settings.page);

await writeFile(rootPath, `${JSON.stringify(root, null, 2)}\n`);
console.log(`已生成 ${path.relative(repoRoot, rootPath)}（路径指到 plugin/）`);
