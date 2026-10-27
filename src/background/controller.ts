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
    nativeAlready = false,
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
      if (nativeAlready) {
        s.native = true;
        s.phase = "active";
        await this.save();
        return true;
      }
      // Experimental native-player fullscreen; retain window fallback on rejection.
      // A rejected request is expected without transient user activation.
      const nativeResult = await chrome.tabs.sendMessage(tabId, {
        type: "native-attempt",
        trigger,
        idleTicket,
      }).catch(() => null);
      if (nativeResult?.ok) {
        s.native = true;
        s.phase = "active";
        await this.save();
        this.log("Native player fullscreen active", { tabId, windowId });
        return true;
      }
      this.log("Native attempt rejected; using existing window fullscreen", nativeResult?.reason);
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
    if (s.native) {
      await chrome.tabs.sendMessage(s.tabId, { type: "native-exit" }).catch(() => {});
      this.sessions.delete(windowId);
      await this.save();
      return;
    }
    if (w && restore && w.state === "fullscreen") {
      // Restore window state first, then immediately release the expanded
      // YouTube player layout. Don't keep the viewport-sized player visible
      // while the second bounds update restores a normal-sized window.
      await chrome.windows.update(windowId, { state: s.original.state });
      await chrome.tabs
        .sendMessage(s.tabId, { type: "deactivate" })
        .catch(() => {});
      if (s.original.state === "normal") {
        // Chrome ordinarily restores the original bounds itself. Avoid a
        // second visible resize unless the restored geometry actually differs.
        const current = await chrome.windows.get(windowId);
        const original = s.original;
        const differs = (["left", "top", "width", "height"] as const).some(
          (key) =>
            original[key] !== undefined &&
            current[key] !== undefined &&
            Math.abs(current[key]! - original[key]!) > 2,
        );
        if (differs)
          await chrome.windows.update(windowId, {
            left: original.left,
            top: original.top,
            width: original.width,
            height: original.height,
          });
      }
    } else {
      await chrome.tabs
        .sendMessage(s.tabId, { type: "deactivate" })
        .catch(() => {});
    }
    this.sessions.delete(windowId);
    await this.save();
    this.log("Fullscreen released", { windowId, restore });
  }
}
