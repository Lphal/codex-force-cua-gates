// 电脑操控与浏览器门控解锁：包装 Statsig 客户端的 getFeatureGate / checkGate，
// 只强制设置里勾选的 gate；应用版本停用（sunset）门控永远不强制。
// 只影响客户端本地读取（设置页可用性判定），不修改任何网络请求。
codexPlus.extension((ctx) => {
  "use strict";

  // 2929582856：appSunset。为 true 时应用直接渲染「要求更新」页，必须永不强制。
  const DENIED = new Set(["2929582856"]);
  const DEFAULT_GATES = ["1506311413", "410065390", "410262010"];

  const patched = new Map();
  let stopped = false;
  let forced = new Set();

  const parseList = (text) => new Set(String(text ?? "").split(/[\s,]+/).filter(Boolean));
  const rebuild = (config = ctx.config || {}) => {
    const configured = config.enabledGates === undefined ? DEFAULT_GATES : parseList(config.enabledGates);
    forced = new Set(configured);
    for (const hash of DENIED) forced.delete(hash);
  };
  const shouldForce = (name) => !stopped && forced.has(String(name));
  const notify = () => {
    try {
      window.dispatchEvent(new CustomEvent("codex-plus-statsig-refreshed", { detail: { source: "force-cua-gates" } }));
    } catch {}
  };
  // 诊断用：CDP / tools/probe.mjs 读这个对象，确认脚本执行到了包装逻辑以及当前强制清单。
  const publish = () => {
    try {
      window.__forceCuaGates = {
        version: String(ctx.manifest?.version ?? "dev"),
        gates: [...forced].sort(),
        patched: patched.size,
        at: Date.now(),
      };
    } catch {}
  };

  const apply = () => {
    const root = window.__STATSIG__;
    if (!root) return;
    const clients = new Set([
      root.firstInstance,
      typeof root.instance === "function" ? root.instance() : null,
      ...Object.values(root.instances || {}),
    ]);
    let changed = false;
    for (const client of clients) {
      if (!client || patched.has(client)) continue;
      const originals = {};
      if (typeof client.getFeatureGate === "function") {
        originals.gate = client.getFeatureGate;
        originals.gateWrapper = function(name, options) {
          const result = originals.gate.call(this, name, options);
          if (!shouldForce(name)) return result;
          return { ...result, value: true, details: { ...(result?.details || {}), reason: "LocalOverride" } };
        };
        client.getFeatureGate = originals.gateWrapper;
      }
      if (typeof client.checkGate === "function") {
        originals.check = client.checkGate;
        originals.checkWrapper = function(name, options) {
          if (shouldForce(name)) return true;
          return originals.check.call(this, name, options);
        };
        client.checkGate = originals.checkWrapper;
      }
      if (!originals.gate && !originals.check) continue;
      patched.set(client, originals);
      changed = true;
    }
    if (changed) notify();
    publish();
  };

  rebuild();
  apply();
  // 仅兜底迟到或重建的 Statsig 客户端实例
  ctx.setInterval(apply, 3000);

  // ChatGPT「拓展 → 本拓展 → 设置」页签：和管理器 settings.html 同一份勾选界面。
  ctx.registerSettingsPanel({
    render: ({ container, config, saveConfig }) => createForceCuaGatesSettings(container, {
      config,
      save: saveConfig,
    }),
  });

  // 配置热更新：ctx.config 尚未替换，先按 next 重建强制清单。
  ctx.onConfigUpdate((next) => {
    rebuild(next);
    apply();
    return true;
  });

  ctx.effect(() => () => {
    stopped = true;
    for (const [client, originals] of patched) {
      if (client.getFeatureGate === originals.gateWrapper) client.getFeatureGate = originals.gate;
      if (client.checkGate === originals.checkWrapper) client.checkGate = originals.check;
    }
    patched.clear();
    notify();
    publish();
  });
});
