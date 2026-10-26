import { beforeEach, describe, it, expect, vi } from "vitest";
import { FullscreenController } from "../src/background/controller";
let windows: Map<number, any>, persisted: any;
beforeEach(() => {
  windows = new Map([
    [
      10,
      {
        id: 10,
        state: "normal",
        type: "normal",
        left: -1920,
        top: 50,
        width: 1400,
        height: 900,
      },
    ],
    [
      20,
      {
        id: 20,
        state: "maximized",
        type: "normal",
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
      },
    ],
  ]);
  persisted = {};
  vi.stubGlobal("chrome", {
    windows: {
      get: vi.fn(async (id: number) => {
        if (!windows.has(id)) throw Error("closed");
        return { ...windows.get(id) };
      }),
      update: vi.fn(async (id: number, patch: any) => {
        Object.assign(windows.get(id), patch);
        return windows.get(id);
      }),
    },
    tabs: {
      sendMessage: vi.fn(async () => ({ ok: true })),
      get: vi.fn(async (id: number) => ({
        id,
        active: true,
        windowId: id === 1 ? 10 : 20,
      })),
    },
    storage: {
      session: {
        get: vi.fn(async () => persisted),
        set: vi.fn(async (v: any) => {
          persisted = structuredClone(v);
        }),
      },
    },
  });
});
describe("fullscreen ownership and restoration", () => {
  it("stores idle ownership and passes its ticket to the existing prepare handshake", async () => {
    const c = new FullscreenController();
    await c.enter(1, 10, "idle", "ticket");
    expect(c.sessions.get(10)?.trigger).toBe("idle");
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, {
      type: "prepare",
      trigger: "idle",
      idleTicket: "ticket",
    });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, {
      type: "activated",
      trigger: "idle",
    });
    expect(persisted.sessions[0].trigger).toBe("idle");
    await c.exit(10);
    expect(windows.get(10).state).toBe("normal");
  });
  it("targets the sending window, preserves negative monitor coordinates, never requests focus", async () => {
    const c = new FullscreenController();
    await c.enter(1, 10);
    expect(windows.get(10).state).toBe("fullscreen");
    expect(windows.get(20).state).toBe("maximized");
    await c.exit(10);
    expect(windows.get(10)).toMatchObject({
      state: "normal",
      left: -1920,
      top: 50,
      width: 1400,
      height: 900,
    });
    for (const [, patch] of vi.mocked(chrome.windows.update).mock.calls)
      expect(patch).not.toHaveProperty("focused");
  });
  it("restores two independent sessions", async () => {
    const c = new FullscreenController();
    await c.enter(1, 10);
    await c.enter(2, 20);
    await c.exit(10);
    expect(windows.get(20).state).toBe("fullscreen");
    await c.exit(20);
    expect(windows.get(20).state).toBe("maximized");
  });
  it("does not own existing manual fullscreen", async () => {
    windows.get(10).state = "fullscreen";
    const c = new FullscreenController();
    expect(await c.enter(1, 10)).toBe(false);
    await c.exit(10);
    expect(chrome.windows.update).not.toHaveBeenCalled();
  });
  it("rejects minimized windows and duplicate entry", async () => {
    const c = new FullscreenController();
    windows.get(10).state = "minimized";
    expect(await c.enter(1, 10)).toBe(false);
    await c.enter(2, 20);
    expect(await c.enter(3, 20)).toBe(false);
  });
  it("rolls back if page preparation fails", async () => {
    vi.mocked(chrome.tabs.sendMessage).mockRejectedValueOnce(Error("tab gone"));
    const c = new FullscreenController();
    await expect(c.enter(1, 10)).rejects.toThrow();
    expect(c.sessions.size).toBe(0);
    expect(windows.get(10).state).toBe("normal");
  });
  it("recovers a persisted session after worker restart", async () => {
    const c = new FullscreenController();
    await c.enter(1, 10);
    const restarted = new FullscreenController();
    await restarted.recover();
    expect(windows.get(10).state).toBe("normal");
    expect(persisted.sessions).toEqual([]);
  });
  it("cleans ownership after the window closes", async () => {
    const c = new FullscreenController();
    await c.enter(1, 10);
    windows.delete(10);
    await c.exit(10);
    expect(c.sessions.size).toBe(0);
  });
  it("does not overwrite a manually changed window state", async () => {
    const c = new FullscreenController();
    await c.enter(1, 10);
    windows.get(10).state = "maximized";
    await c.exit(10);
    expect(windows.get(10).state).toBe("maximized");
  });
  it("retains ownership when restoration fails so it can retry", async () => {
    const c = new FullscreenController();
    await c.enter(1, 10);
    vi.mocked(chrome.windows.update).mockRejectedValueOnce(
      Error("temporary failure"),
    );
    await expect(c.exit(10)).rejects.toThrow();
    expect(c.sessions.has(10)).toBe(true);
    await c.exit(10);
    expect(windows.get(10).state).toBe("normal");
    expect(c.sessions.size).toBe(0);
  });
});
