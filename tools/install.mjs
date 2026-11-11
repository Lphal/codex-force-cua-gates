#!/usr/bin/env node
// 安装 / 同步本仓库的拓展包到 Codex++ 用户脚本目录。
//
// 用法：
//   node tools/install.mjs             # 复制 plugin/ 到用户脚本目录（发布态）
//   node tools/install.mjs --link      # 软链接 plugin/，改仓库文件后热重载即可生效（开发态）
//   node tools/install.mjs --uninstall # 移除已安装的包与启用项
//
// 安装后仍需让 ChatGPT 重新加载脚本：管理器 → 用户脚本 → 热重载脚本，
// 或运行 node tools/reload.mjs。

import { cp, lstat, mkdir, readFile, readlink, rename, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(repoRoot, "plugin");
const configDir = process.env.CODEX_PLUS_CONFIG_DIR
  ? path.resolve(process.env.CODEX_PLUS_CONFIG_DIR)
  : path.join(homedir(), ".config", "Codex++");
const userScriptsDir = path.join(configDir, "user_scripts");
const configFile = path.join(configDir, "user_scripts.json");
const backupDir = path.join(configDir, "user-script-backups");

const manifest = JSON.parse(await readFile(path.join(sourceDir, "codexpp.json"), "utf8"));
const id = String(manifest.id || "").trim();
if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`codexpp.json 的 id 不合法：${id}`);
const scriptKey = `user:${id}`;
const targetDir = path.join(userScriptsDir, id);

const mode = process.argv.includes("--link") ? "link" : "copy";
const uninstall = process.argv.includes("--uninstall");

const exists = async (pathname) => {
  try {
    await lstat(pathname);
    return true;
  } catch {
    return false;
  }
};

async function setEnabled(enabled) {
  const text = (await exists(configFile)) ? await readFile(configFile, "utf8") : "{}";
  const config = JSON.parse(text);
  config.enabled ??= true;
  config.scripts ??= {};
  if (enabled) config.scripts[scriptKey] = true;
  else delete config.scripts[scriptKey];
  await writeFile(configFile, `${JSON.stringify(config, null, 2)}\n`);
}

async function backupInstalled() {
  if (!(await exists(targetDir))) return;
  await mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = path.join(backupDir, `${id}-${stamp}`);
  await rename(targetDir, backup);
  console.log(`已把原安装移出用户脚本目录：${backup}`);
}

/** 已经是指向本仓库的软链时，重复安装不制造备份。 */
async function alreadyLinked() {
  try {
    if (!(await lstat(targetDir)).isSymbolicLink()) return false;
    return path.resolve(userScriptsDir, await readlink(targetDir)) === sourceDir;
  } catch {
    return false;
  }
}

if (uninstall) {
  await backupInstalled();
  await setEnabled(false);
  console.log(`已卸下安装并从 user_scripts.json 删除 ${scriptKey}（原目录在 ${backupDir}）`);
  process.exit(0);
}

await mkdir(userScriptsDir, { recursive: true });
if (mode === "link" && (await alreadyLinked())) {
  console.log(`已是软链，跳过文件同步：${targetDir} → ${sourceDir}`);
} else {
  await backupInstalled();
  if (mode === "link") {
    await symlink(sourceDir, targetDir, "dir");
  } else {
    await cp(sourceDir, targetDir, { recursive: true });
  }
  console.log(`已${mode === "link" ? "软链" : "复制"} ${sourceDir} → ${targetDir}`);
}
await setEnabled(true);

console.log(`启用项: ${scriptKey} = true（${configFile}）`);
console.log("下一步: node tools/reload.mjs && node tools/probe.mjs");
