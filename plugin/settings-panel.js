// ChatGPT 里「拓展 → 本拓展 → 设置」页签用的面板（ctx.registerSettingsPanel，见 main.js）。
// 与 Codex++ 管理器里的 settings.html 是同一份门控清单；改一处要同步另一处，
// 可用 tools/check-gates.mjs 校验两边哈希是否一致。
//
// 这里的名字都带 fcg 前缀：renderer 文件会拼进同一个作用域，别和 main.js 撞名。
function createForceCuaGatesSettings(container, { config, save } = {}) {
  const CUA_GATES = [
    {
      hash: "1506311413",
      title: "电脑操控",
      desc: "设置里的 Computer use：截屏、鼠标与键盘控制。",
    },
    {
      hash: "410065390",
      title: "外部浏览器",
      desc: "通过浏览器扩展把操作交给外部 Chrome / Edge。",
    },
    {
      hash: "410262010",
      title: "内置浏览器 Agent",
      desc: "应用内浏览器面板的 Agent 能力。",
    },
  ];
  const OTHER_GATES = [
    {
      hash: "1079089693",
      title: "会话时间线历史",
      desc: "threadTimelineHistory，与电脑操控无关。",
    },
    {
      hash: "1138821566",
      title: "应用 / 连接器列表预取",
      desc: "开启后跳过预取。",
      reverse: true,
    },
    {
      hash: "1342944728",
      title: "购物商品卡片 v2",
      desc: "商品卡片的 v2 图片展示。",
    },
    {
      hash: "1613860123",
      title: "广告控制 / 免费版关闭广告",
      desc: "免费版广告关闭相关设置。",
    },
    {
      hash: "1625797156",
      title: "Work 模式引导",
      desc: "Work 模式推广 / reonboarding。",
    },
    {
      hash: "2200939124",
      title: "Codex Pages",
      desc: "Pages 功能可用性。",
    },
    {
      hash: "224248639",
      title: "粘贴文件 / 文件库",
      desc: "粘贴文件与文件库入口。",
    },
    {
      hash: "2608972388",
      title: "DIL 诊断",
      desc: "模型生成 UI 的诊断与遥测。",
    },
    {
      hash: "2830112640",
      title: "应用入口 / UTM 归因",
      desc: "开启后跳过入口与 UTM 归因上报。",
      reverse: true,
    },
    {
      hash: "2911503418",
      title: "插件创作（作者功能）",
      desc: "开启即禁用插件创作。",
      reverse: true,
    },
    {
      hash: "3097567806",
      title: "流式首包等待 / 重试",
      desc: "等待首个响应时的流式重试。",
    },
    {
      hash: "3142691021",
      title: "TPP 新手引导个性化",
      desc: "新手引导里的「个性化下一步」。",
    },
    {
      hash: "4101895715",
      title: "广告图片卡片展示",
      desc: "开启即关闭图片卡片展示类型。",
      reverse: true,
    },
    {
      hash: "4185326558",
      title: "助手消息修订",
      desc: "Assistant revisions。",
    },
    {
      hash: "665873859",
      title: "广告控制设置",
      desc: "Ads controls 设置项。",
    },
  ];
  const DEFAULT_HASHES = CUA_GATES.map((gate) => gate.hash);
  const KNOWN = new Set([...CUA_GATES, ...OTHER_GATES].map((gate) => gate.hash));
  const parse = (text) => new Set(String(text ?? "").split(/[\s,]+/).filter(Boolean));
  const enabled = parse(config?.enabledGates);
  const unknown = [...enabled]
    .filter((hash) => !KNOWN.has(hash))
    .map((hash) => ({ hash, title: "未识别门控", desc: "配置里已有的未知哈希，取消勾选即移除。" }));

  const row = (gate) => `
    <label class="fcg-row">
      <input type="checkbox" class="fcg-input" data-hash="${gate.hash}"${enabled.has(gate.hash) ? " checked" : ""}>
      <span class="fcg-box" aria-hidden="true"></span>
      <span class="fcg-text">
        <span class="fcg-title">${gate.title}（${gate.hash}）${gate.reverse ? '<span class="fcg-tag fcg-reverse">反向</span>' : ""}</span>
        <span class="fcg-desc">${gate.desc}</span>
      </span>
    </label>`;

  const group = (title, note, gates) => `
    <div class="fcg-group-title">${title}<span>${note}</span></div>
    ${gates.map(row).join("")}`;

  const style = document.createElement("style");
  style.textContent = `
    .fcg {
      --fcg-fg: var(--codex-plus-text, #171717);
      --fcg-muted: var(--codex-plus-text-secondary, #6b7280);
      --fcg-border: var(--codex-plus-border, rgba(0,0,0,.12));
      --fcg-hover: var(--codex-plus-bg-hover, rgba(0,0,0,.05));
      --fcg-accent: var(--codex-plus-success, #10a37f);
      --fcg-danger: var(--codex-plus-danger, #dc2626);
      --fcg-warning: var(--codex-plus-warning, #b45309);
      color: var(--fcg-fg); font-size: 13px; line-height: 1.5; text-align: left;
    }
    .fcg * { box-sizing: border-box; }
    .fcg button { font: inherit; color: inherit; }
    .fcg-intro { color: var(--fcg-muted); font-size: 12px; margin-bottom: 6px; }
    .fcg-group-title { display: flex; align-items: baseline; gap: 8px; margin: 12px 0 2px; font-weight: 600; }
    .fcg-group-title span { color: var(--fcg-muted); font-size: 11px; font-weight: 400; }
    .fcg-row { position: relative; display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; cursor: pointer; border-top: 1px solid var(--fcg-border); }
    /* Codex 页面会改写原生 checkbox 的外观，这里隐藏 input、自己画一个。 */
    .fcg-row .fcg-input {
      position: absolute; width: 1px; height: 1px; margin: 0; padding: 0;
      opacity: 0; pointer-events: none; appearance: none; -webkit-appearance: none;
    }
    .fcg-box {
      flex: none; width: 16px; height: 16px; margin-top: 2px;
      display: grid; place-items: center;
      border: 1.5px solid var(--fcg-border); border-radius: 4px;
      background: transparent; transition: background .12s ease, border-color .12s ease;
    }
    .fcg-input:checked + .fcg-box { background: var(--fcg-accent); border-color: var(--fcg-accent); }
    .fcg-input:checked + .fcg-box::after {
      content: ""; width: 8px; height: 4px; margin-top: -2px;
      border-left: 2px solid #fff; border-bottom: 2px solid #fff;
      transform: rotate(-45deg);
    }
    .fcg-input:focus-visible + .fcg-box { outline: 2px solid var(--fcg-accent); outline-offset: 2px; }
    .fcg-text { display: grid; gap: 1px; min-width: 0; }
    .fcg-title { font-weight: 500; }
    .fcg-desc { color: var(--fcg-muted); font-size: 12px; }
    .fcg-tag { padding: 0 6px; margin-left: 6px; border-radius: 999px; color: var(--fcg-danger);
      background: color-mix(in srgb, var(--fcg-danger) 12%, transparent); font-size: 11px; font-weight: 500; }
    .fcg-tag.fcg-reverse { color: var(--fcg-warning); background: color-mix(in srgb, var(--fcg-warning) 14%, transparent); }
    .fcg-footer { display: flex; align-items: center; gap: 10px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--fcg-border); }
    .fcg-footer button { padding: 3px 10px; border-radius: 6px; cursor: pointer; background: transparent; border: 1px solid var(--fcg-border); }
    .fcg-footer button:hover { background: var(--fcg-hover); }
    .fcg-status { color: var(--fcg-muted); font-size: 12px; }
    .fcg-status.fcg-ok { color: var(--fcg-accent); }
    .fcg-status.fcg-error { color: var(--fcg-danger); }
    .fcg-hint { color: var(--fcg-muted); font-size: 12px; margin-top: 8px; }
  `;

  const root = document.createElement("div");
  root.className = "fcg";
  root.innerHTML = `
    <div class="fcg-intro">勾选即保存并热更新；带「反向」标记的项开启会关闭对应功能。</div>
    ${group("电脑操控与浏览器", "默认开启", CUA_GATES)}
    ${group("其它功能", "与电脑操控无关，默认关闭", OTHER_GATES)}
    ${unknown.length ? group("未识别", "来自旧配置", unknown) : ""}
    <div class="fcg-footer">
      <button type="button" data-reset>恢复默认</button>
      <span class="fcg-status" data-status></span>
    </div>`;

  container.replaceChildren(style, root);

  const inputs = [...root.querySelectorAll("input[data-hash]")];
  const status = root.querySelector("[data-status]");
  const reset = root.querySelector("[data-reset]");
  let timer = 0;
  let disposed = false;

  const setStatus = (text, kind) => {
    status.textContent = text;
    status.className = `fcg-status${kind ? ` fcg-${kind}` : ""}`;
  };
  const persist = () => {
    clearTimeout(timer);
    timer = window.setTimeout(async () => {
      if (disposed) return;
      const picked = inputs.filter((input) => input.checked).map((input) => input.dataset.hash).join(" ");
      try {
        await save?.({ enabledGates: picked });
        if (!disposed) {
          setStatus("已保存", "ok");
          timer = window.setTimeout(() => { if (!disposed) setStatus("", ""); }, 1200);
        }
      } catch (error) {
        if (!disposed) setStatus(`保存失败：${error?.message || error}`, "error");
      }
    }, 350);
  };

  for (const input of inputs) input.addEventListener("change", persist);
  reset.addEventListener("click", () => {
    const defaults = new Set(DEFAULT_HASHES);
    for (const input of inputs) input.checked = defaults.has(input.dataset.hash);
    persist();
  });

  return () => {
    disposed = true;
    clearTimeout(timer);
    style.remove();
    root.remove();
  };
}
