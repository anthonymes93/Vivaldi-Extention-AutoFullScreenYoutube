import type { Session } from "../shared/types";
export class FullscreenController {
  constructor(
    private log: (message: string, data: unknown) => void = () => {},
  ) {}
  sessions = new Map<number, Session>();
  async save() {
    await chrome.storage.session.set({ sessions: [...this.sessions.values()] });
  }
  async recover() {
    const saved = (await chrome.storage.session.get("sessions")).sessions as
      Session[] | undefined;
    for (const s of saved || []) this.sessions.set(s.windowId, s);
    for (const id of this.sessions.keys())
      await this.exit(id).catch((error) =>
        this.log("Recovery will retry", { windowId: id, error: String(error) }),
      );
  }
  async enter(
    tabId: number,
    windowId: number,
    trigger: Session["trigger"] = "leave",
    idleTicket?: string,
  ) {
    if (this.sessions.has(windowId)) return false;
    const w = await chrome.windows.get(windowId);
    if (
      w.type !== "normal" ||
      (w.state !== "normal" && w.state !== "maximized")
    )
      return false;
    const s: Session = {
      trigger,
      tabId,
      windowId,
      phase: "entering",
      original: {
        state: w.state,
        left: w.left,
        top: w.top,
        width: w.width,
        height: w.height,
      },
    };
    this.sessions.set(windowId, s);
    await this.save();
    this.log("Entering fullscreen", { tabId, windowId });
    try {
      const prepared = await chrome.tabs.sendMessage(tabId, {
        type: "prepare",
        trigger,
        idleTicket,
      });
      if (!prepared?.ok) throw Error("Player is no longer eligible");
      const tab = await chrome.tabs.get(tabId);
      if (!tab.active || tab.windowId !== windowId)
        throw Error("Tab changed before fullscreen entry");
      // Never use WINDOW_ID_CURRENT, and never request focus.
      await chrome.windows.update(windowId, { state: "fullscreen" });
      if ((await chrome.windows.get(windowId)).state !== "fullscreen")
        throw Error("Browser refused fullscreen");
      s.phase = "active";
      await this.save();
      await chrome.tabs.sendMessage(tabId, { type: "activated", trigger });
      this.log("Fullscreen active", { tabId, windowId });
      return true;
    } catch (e) {
      await this.exit(windowId);
      throw e;
    }
  }
  async exit(windowId: number, restore = true) {
    const s = this.sessions.get(windowId);
    if (!s) return;
    s.phase = "exiting";
    await this.save();
    const w = await chrome.windows.get(windowId).catch(() => null);
    if (w) {
      if (restore && w.state === "fullscreen") {
        await chrome.windows.update(windowId, { state: s.original.state });
        if (s.original.state === "normal")
          await chrome.windows.update(windowId, {
            left: s.original.left,
            top: s.original.top,
            width: s.original.width,
            height: s.original.height,
          });
      }
    }
    await chrome.tabs
      .sendMessage(s.tabId, { type: "deactivate" })
      .catch(() => {});
    this.sessions.delete(windowId);
    await this.save();
    this.log("Fullscreen released", { windowId, restore });
  }
}
