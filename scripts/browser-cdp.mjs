import { readFile } from 'node:fs/promises';

/** Connect only to a caller-created disposable Chrome profile. */
export async function connectProfile(profile) {
  const [port, path] = (await readFile(`${profile}/DevToolsActivePort`, 'utf8')).trim().split(/\r?\n/);
  const socket = new WebSocket(`ws://127.0.0.1:${Number(port)}${path}`);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let nextId = 0;
  const pending = new Map(), events = [], listeners = new Set();
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (!message.id) { events.push(message); for (const listener of listeners) listener(message); return; }
    const promise = pending.get(message.id);
    if (!promise) return;
    clearTimeout(promise.timer); pending.delete(message.id);
    if (message.error) promise.reject(Error(JSON.stringify(message.error)));
    else promise.resolve(message.result);
  });
  function send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 15000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  async function evaluate(sessionId, expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async function page(url) {
    const { targetId } = await send('Target.createTarget', { url, background: true });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Runtime.enable', {}, sessionId);
    await send('Target.activateTarget', { targetId });
    return { targetId, sessionId };
  }
  return { send, evaluate, page, events, onEvent: listener => { listeners.add(listener); return () => listeners.delete(listener); }, close: () => socket.close() };
}
