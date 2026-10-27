export class NativePointer {
  port: chrome.runtime.Port | null = null;
  status = "Not connected";
  bound = new Set<number>();
  pending = new Map<string, (r: any) => void>();
  constructor(
    private edge: (windowId: number, inside: boolean, initial: boolean) => void,
    private lost: () => void,
    private idleMotion: (windowId: number) => void,
  ) {}
  connect() {
    if (this.port) return;
    this.status = "Connecting";
    try {
      const port = chrome.runtime.connectNative("com.autofullscreen.pointer");
      this.port = port;
      port.onMessage.addListener((m) => {
        this.status = "Connected";
        if (m.requestId) {
          this.pending.get(m.requestId)?.(m);
          this.pending.delete(m.requestId);
        }
        if (
          m.type === "pointer" &&
          Number.isInteger(m.windowId) &&
          typeof m.inside === "boolean"
        )
          this.edge(m.windowId, m.inside, m.initial === true);
        if (m.type === "idle-motion" && Number.isInteger(m.windowId))
          this.idleMotion(m.windowId);
      });
      port.onDisconnect.addListener(() => {
        this.status = chrome.runtime.lastError?.message || "Disconnected";
        this.port = null;
        this.bound.clear();
        for (const cb of this.pending.values()) cb({ ok: false });
        this.pending.clear();
        this.lost();
      });
    } catch (e) {
      this.status = String(e);
    }
  }
  disconnect() {
    this.port?.disconnect();
    this.port = null;
    this.bound.clear();
    this.status = "Not connected";
  }
  request(data: object): Promise<any> {
    if (!this.port) return Promise.resolve({ ok: false });
    const requestId = crypto.randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve({ ok: false });
      }, 2500);
      this.pending.set(requestId, (r) => {
        clearTimeout(timer);
        resolve(r);
      });
      try {
        this.port!.postMessage({ ...data, requestId });
      } catch {
        clearTimeout(timer);
        this.pending.delete(requestId);
        resolve({ ok: false });
      }
    });
  }
  async bind(tabId: number, windowId: number) {
    if (this.bound.has(windowId) || !this.port) return;
    const token = "AFS-" + crypto.randomUUID();
    try {
      await chrome.tabs.sendMessage(tabId, { type: "bind-title", token });
      const r = await this.request({ type: "bind", windowId, token });
      if (r.ok) this.bound.add(windowId);
      else
        this.status =
          "Connected; window binding failed. Activate YouTube and retry.";
    } finally {
      await chrome.tabs
        .sendMessage(tabId, { type: "unbind-title", token })
        .catch(() => {});
    }
  }
}
