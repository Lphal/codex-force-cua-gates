#!/usr/bin/env node
// ChatGPT.app 的 app.asar 只读工具：按文件路径列举/抽取，或把 grep 的绝对字节偏移映射回包内文件。
// 用途：应用更新后重新定位 gate 哈希调用点、核对设置页文案。
//
// 用法：
//   node tools/asar.mjs list [路径关键字]
//   node tools/asar.mjs map <绝对字节偏移> [上下文字节数]
//   node tools/asar.mjs extract <包内路径> <输出文件>
//   node tools/asar.mjs text <包内路径> [本地偏移] [字节数]

import { open } from "node:fs/promises";
import path from "node:path";

const ASAR = process.env.CHATGPT_ASAR || "/Applications/ChatGPT.app/Contents/Resources/app.asar";
const [command, ...args] = process.argv.slice(2);

const handle = await open(ASAR, "r");
const { size: fileSize } = await handle.stat();

const head = Buffer.alloc(16);
await handle.read(head, 0, 16, 0);
if (head.readUInt32LE(0) !== 4) throw new Error("不是 asar 或格式有变化");
const headerSize = head.readUInt32LE(12);
const headerBuffer = Buffer.alloc(headerSize);
await handle.read(headerBuffer, 0, headerSize, 16);
const header = JSON.parse(headerBuffer.toString("utf8").replace(/\0+$/, ""));
const dataStart = 16 + headerSize;

const files = [];
const walk = (node, prefix) => {
  for (const [name, entry] of Object.entries(node.files || {})) {
    const at = prefix ? `${prefix}/${name}` : name;
    if (entry.files) walk(entry, at);
    else if (entry.offset !== undefined) files.push({ path: at, size: entry.size ?? 0, offset: Number(entry.offset), unpacked: !!entry.unpacked });
  }
};
walk(header, "");
files.sort((a, b) => a.offset - b.offset);

const findFile = (target) => files.find((file) => file.path === target || file.path === target.replace(/^\//, ""));

const fileAt = (absolute) => {
  let low = 0;
  let high = files.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const file = files[mid];
    const start = dataStart + file.offset;
    if (absolute < start) high = mid - 1;
    else if (absolute >= start + file.size) low = mid + 1;
    else return file;
  }
  return null;
};

const readText = async (file, localOffset, length) => {
  const start = dataStart + file.offset + localOffset;
  const available = Math.max(0, Math.min(length, file.size - localOffset));
  const buffer = Buffer.alloc(available);
  await handle.read(buffer, 0, available, start);
  return buffer.toString("utf8");
};

if (command === "list") {
  const keyword = (args[0] || "").toLowerCase();
  const matched = files.filter((file) => file.path.toLowerCase().includes(keyword));
  for (const file of matched) console.log(`${String(file.size).padStart(10)}  ${file.path}${file.unpacked ? "  [unpacked]" : ""}`);
  console.log(`共 ${matched.length} 个文件；包内 ${files.length} 个`);
} else if (command === "map") {
  const absolute = Number(args[0]);
  const context = Number(args[1] || 0);
  const file = files.find((entry) => absolute >= dataStart + entry.offset && absolute < dataStart + entry.offset + entry.size);
  if (!file) {
    console.log(`偏移 ${absolute} 不在任何文件内容里（数据区从 ${dataStart} 开始，共 ${files.length} 个文件）`);
    process.exit(1);
  }
  const local = absolute - dataStart - file.offset;
  console.log(`文件: ${file.path}`);
  console.log(`文件内偏移: ${local} / ${file.size}`);
  if (context) console.log(`\n${await readText(file, Math.max(0, local - context), context * 2)}`);
} else if (command === "extract") {
  const file = findFile(args[0]);
  if (!file) throw new Error(`包内没有 ${args[0]}`);
  const output = path.resolve(args[1]);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(output, await readText(file, 0, file.size));
  console.log(`已写出 ${file.path} → ${output}（${file.size} 字节）`);
} else if (command === "text") {
  const file = findFile(args[0]);
  if (!file) throw new Error(`包内没有 ${args[0]}`);
  const offset = Number(args[1] || 0);
  const length = Number(args[2] || 4000);
  console.log(await readText(file, offset, length));
} else if (command === "grep") {
  const needles = args.filter((arg) => !arg.startsWith("--"));
  const option = (name, fallback) => {
    const found = args.find((arg) => arg.startsWith(`--${name}=`));
    return found ? found.slice(name.length + 3) : fallback;
  };
  const context = Number(option("context", 120));
  const limit = Number(option("limit", 60));
  if (!needles.length) throw new Error("grep 需要至少一个关键字");

  const chunkSize = 8 * 1024 * 1024;
  const overlap = Math.max(64, ...needles.map((needle) => Buffer.byteLength(needle)));
  const buffer = Buffer.alloc(chunkSize + overlap);
  const seen = new Set();
  const hits = [];
  let position = 0;
  let tail = 0;

  while (position < fileSize && hits.length < limit) {
    const toRead = Math.min(chunkSize, fileSize - position);
    const { bytesRead } = await handle.read(buffer, tail, toRead, position);
    const window = buffer.subarray(0, tail + bytesRead);
    for (const needle of needles) {
      let index = 0;
      while ((index = window.indexOf(needle, index)) !== -1 && hits.length < limit) {
        const absolute = position - tail + index;
        const key = `${absolute}:${needle}`;
        if (absolute >= dataStart && !seen.has(key)) {
          seen.add(key);
          hits.push({ absolute, needle });
        }
        index += needle.length;
      }
    }
    tail = Math.min(overlap, window.length);
    window.copy(buffer, 0, window.length - tail);
    position += bytesRead;
  }

  for (const hit of hits) {
    const file = fileAt(hit.absolute);
    if (!file) continue;
    const local = hit.absolute - dataStart - file.offset;
    const from = Math.max(0, local - context);
    const text = await readText(file, from, Math.min(file.size - from, local - from + hit.needle.length + context));
    const snippet = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").replace(/\s+/g, " ");
    console.log(`\n${file.path} @${local}\n${snippet}`);
  }
  if (!hits.length) console.log("没有命中");
} else {
  console.log("用法: node tools/asar.mjs list|map|grep|extract|text ...");
  process.exit(1);
}

await handle.close();
if (!command) process.exit(1);
