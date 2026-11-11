// 通过 CDP 连到 ChatGPT 渲染进程的最小工具集。
// 前提：ChatGPT 由 Codex++ 带 --remote-debugging-port=9229 启动。
const endpoint = process.env.CDP_ENDPOINT || "http://127.0.0.1:9229";

export { endpoint };

/** 页面里主窗口和 avatar overlay 都是 title=ChatGPT；门控与用户脚本只在主窗口。 */
export function isMainWindow(target) {
  return target.type === "page" && String(target.url) === "app://-/index.html";
}

export async function listPages() {
  const response = await fetch(`${endpoint}/json/list`);
  if (!response.ok) throw new Error(`CDP ${endpoint}/json/list 返回 ${response.status}`);
  return (await response.json()).filter((target) => target.type === "page");
}

export async function findMainPage() {
  const pages = await listPages();
  return (
    pages.find(isMainWindow) ||
    pages.find((target) => target.title === "ChatGPT" && !String(target.url).includes("avatar-overlay")) ||
    null
  );
}

/** 连上页面，返回 { evaluate(expression), close() }。 */
export async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error(`连不上 ${target.webSocketDebuggerUrl}`)), { once: true });
  });

  const call = (method, params) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  const evaluate = async (expression) => {
    const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
      throw new Error(detail);
    }
    return result.result.value;
  };

  return { evaluate, close: () => ws.close() };
}
