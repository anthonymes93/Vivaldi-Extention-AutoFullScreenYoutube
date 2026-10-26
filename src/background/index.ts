import { getSettings } from "../shared/settings";
import { ineligible, pointerEdge } from "../shared/machine";
import type { Settings, Snapshot, TabState, Session } from "../shared/types";
import { FullscreenController } from "./controller";
import { NativePointer } from "./pointer";
const controller = new FullscreenController((message, data) => {
    if (settings?.debug) console.debug("[Auto Fullscreen]", message, data);
  }),
  tabs = new Map<number, TabState>(),
  timers = new Map<number, ReturnType<typeof setTimeout>>();
let settings: Settings;
let chain: Promise<unknown> = Promise.resolve();
function queue<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(() => ready).then(fn);
  chain = p.catch((e) => {
    if (settings?.debug) console.warn("[Auto Fullscreen]", e);
  });
  return p;
}
const native = new NativePointer(
  (wid, inside, initial) => {
    void queue(async () => {
      for (const [id, t] of tabs)
        if (t.windowId === wid) {
          const tab = await chrome.tabs.get(id).catch(() => null);
          if (tab?.active) {
            if (initial) {
              t.pointer = {
                inside,
                armed: inside && !t.pointer.blocked,
                blocked: t.pointer.blocked,
              };
              await saveTabs();
            } else await edge(id, inside);
          }
        }
    });
  },
  () => {
    void queue(async () => {
      for (const id of controller.sessions.keys()) await exit(id);
    });
  },
);
const ready = (async () => {
  settings = await getSettings();
  await controller.recover();
  const saved = (await chrome.storage.session.get("trackedTabs"))
    .trackedTabs as [number, TabState][] | undefined;
  for (const [id, t] of saved || []) tabs.set(id, t);
  if (
    settings.enabled &&
    settings.detection === "helper" &&
    (await chrome.permissions.contains({ permissions: ["nativeMessaging"] }))
  )
    native.connect();
  const existing = await chrome.tabs.query({
    url: "https://www.youtube.com/*",
  });
  const ids = new Set(existing.map((t) => t.id));
  for (const id of tabs.keys()) if (!ids.has(id)) tabs.delete(id);
  for (const t of existing)
    if (t.id !== undefined) {
      const s = await chrome.tabs
        .sendMessage(t.id, { type: "snapshot" })
        .catch(() => null);
      if (s) await update(t.id, t.windowId, s).catch(() => {});
    }
  await chrome.alarms.create("reconcile", { periodInMinutes: 0.5 });
})();
async function saveTabs() {
  await chrome.storage.session.set({ trackedTabs: [...tabs.entries()] });
}
function cancel(id: number) {
  clearTimeout(timers.get(id));
  timers.delete(id);
}
async function exit(wid: number, restore = true) {
  await controller.exit(wid, restore);
  await native.request({ type: "release", windowId: wid });
}
async function activate(
  id: number,
  trigger: Session["trigger"] = "leave",
  idleTicket?: string,
) {
  const t = tabs.get(id);
  if (!t || t.pointer.blocked || controller.sessions.has(t.windowId)) return;
  if (trigger === "leave" && t.pointer.inside) return;
  if (trigger === "idle" && (!settings.idleEnabled || !idleTicket)) return;
  const tab = await chrome.tabs.get(id).catch(() => null);
  if (!tab?.active || tab.windowId !== t.windowId) return;
  const fresh = (await chrome.tabs
    .sendMessage(id, { type: "snapshot" })
    .catch(() => null)) as Snapshot | null;
  if (!fresh || ineligible(fresh, settings)) return;
  if (
    trigger === "idle" &&
    !(
      await chrome.tabs
        .sendMessage(id, { type: "idle-check", idleTicket })
        .catch(() => null)
    )?.ok
  )
    return;
  if (settings.detection === "helper") {
    const check = await native.request({ type: "check", windowId: t.windowId });
    if (!check.ok || check.inside !== (trigger === "idle")) return;
    if (
      !(
        await native.request({
          type: "guard",
          windowId: t.windowId,
          allowInside: trigger === "idle",
        })
      ).ok
    )
      return;
  }
  try {
    if (!(await controller.enter(id, t.windowId, trigger, idleTicket)))
      await native.request({ type: "release", windowId: t.windowId });
  } catch (e) {
    t.reason = String(e);
    await native.request({ type: "release", windowId: t.windowId });
  }
}
async function edge(id: number, inside: boolean) {
  const t = tabs.get(id);
  if (!t) return;
  if (settings.manualOverride === "navigation" && t.pointer.blocked) {
    t.pointer.inside = inside;
    if (inside) cancel(id);
    await saveTabs();
    return;
  }
  const next = pointerEdge(t.pointer, inside);
  t.pointer = next.state;
  await saveTabs();
  if (settings.debug)
    console.debug("[Auto Fullscreen] Pointer transition", {
      tabId: id,
      windowId: t.windowId,
      inside,
      enter: next.enter,
    });
  if (inside) {
    cancel(id);
    if (
      settings.autoExit &&
      (!t.snapshot.nativeFullscreen || controller.sessions.get(t.windowId)?.native) &&
      controller.sessions.get(t.windowId)?.trigger !== "idle"
    )
      await exit(t.windowId);
    return;
  }
  if (
    next.enter &&
    !ineligible(t.snapshot, settings) &&
    !controller.sessions.has(t.windowId)
  ) {
    cancel(id);
    if (settings.delay)
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id);
          void queue(() => activate(id));
        }, settings.delay * 1000),
      );
    else await activate(id);
  }
}
async function update(id: number, wid: number, s: Snapshot) {
  let t = tabs.get(id);
  if (!t) {
    t = {
      windowId: wid,
      snapshot: s,
      pointer: { inside: false, armed: false, blocked: false },
    };
    tabs.set(id, t);
  }
  const navigated = t.snapshot.url !== s.url;
  t.snapshot = s;
  t.windowId = wid;
  t.reason = undefined;
  if (navigated) {
    cancel(id);
    t.pointer = { inside: false, armed: false, blocked: false };
    await saveTabs();
  }
  const owned = controller.sessions.get(wid);
  // Native fullscreen can end outside our controller (Escape, YouTube UI).
  // Release ownership immediately, otherwise later auto-activation is blocked.
  if (owned?.tabId === id && owned.native && !s.nativeFullscreen &&
      owned.phase === "active") {
    await exit(wid);
    t.pointer = { inside: false, armed: false, blocked: true };
    await saveTabs();
    return;
  }
  if (
    owned?.tabId === id &&
    s.nativeFullscreen &&
    !owned.native &&
    !navigated &&
    settings.enabled
  ) {
    cancel(id);
    if (owned.phase !== "manual") {
      owned.phase = "manual";
      await controller.save();
      await chrome.tabs
        .sendMessage(id, { type: "manual-overlay" })
        .catch(() => {});
    }
    return;
  }
  if (owned?.tabId === id && owned.phase === "manual" && !s.nativeFullscreen) {
    await exit(wid);
    t.pointer = { inside: false, armed: false, blocked: true };
    await saveTabs();
  }
  if ((ineligible(s, settings) && !(owned?.native && s.nativeFullscreen)) || navigated) {
    cancel(id);
    if (controller.sessions.get(wid)?.tabId === id) await exit(wid);
  }
  if (settings.enabled && settings.detection === "helper" && s.watch) {
    const tab = await chrome.tabs.get(id);
    if (tab.active) {
      await native.bind(id, wid);
      if (
        !t.pointer.armed &&
        !t.pointer.blocked &&
        !controller.sessions.has(wid)
      ) {
        const p = await native.request({ type: "check", windowId: wid });
        if (p.ok && p.inside === true) await edge(id, true);
      }
    }
  }
}
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  const id = sender.tab?.id,
    wid = sender.tab?.windowId;
  void queue(async () => {
    if (
      id !== undefined &&
      wid !== undefined &&
      sender.url?.startsWith("https://www.youtube.com/")
    ) {
      if (
        sender.frameId !== 0 ||
        !sender.url?.startsWith("https://www.youtube.com/")
      )
        return;
      if (m.type === "state") await update(id, wid, m.snapshot);
      if (m.type === "idle") await activate(id, "idle", m.idleTicket);
      if (m.type === "interact") {
        const session = controller.sessions.get(wid);
        if (
          session?.tabId === id &&
          session.trigger === "idle" &&
          session.phase !== "manual"
        )
          await exit(wid);
      }
      if (m.type === "pointer" && settings.detection === "browser")
        await edge(id, m.inside);
      if (m.type === "escape") {
        cancel(id);
        const t = tabs.get(id);
        if (t) t.pointer = { inside: false, armed: false, blocked: true };
        await saveTabs();
        if (controller.sessions.get(wid)?.tabId === id) await exit(wid);
      }
      return { ok: true };
    }
    if (
      sender.id !== chrome.runtime.id ||
      !sender.url?.startsWith(chrome.runtime.getURL(""))
    )
      return;
    if (m.type === "status")
      return {
        tabs: [...tabs.entries()].map(([id, t]) => ({
          id,
          ...t,
          reason:
            t.reason ||
            ineligible(t.snapshot, settings) ||
            (t.pointer.blocked
              ? "Manual override: return and leave again"
              : "Ready for pointer exit or page inactivity"),
        })),
        sessions: [...controller.sessions.values()],
        helper: native.status,
        bound: [...native.bound],
      };
    if (m.type === "reconnect") {
      native.disconnect();
      if (settings.detection === "helper") native.connect();
      for (const [id, t] of tabs)
        if ((await chrome.tabs.get(id).catch(() => null))?.active)
          await native.bind(id, t.windowId);
      return { ok: true };
    }
  }).then(reply, (e) => reply({ error: String(e) }));
  return true;
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings)
    void queue(async () => {
      const old = settings;
      settings = await getSettings();
      for (const id of timers.keys()) cancel(id);
      if (!settings.enabled || settings.detection !== old.detection) {
        for (const wid of controller.sessions.keys()) await exit(wid);
        for (const t of tabs.values())
          t.pointer = { inside: false, armed: false, blocked: false };
      }
      if (settings.enabled && settings.detection === "helper") {
        if (
          await chrome.permissions.contains({
            permissions: ["nativeMessaging"],
          })
        )
          native.connect();
        for (const [id, t] of tabs)
          if ((await chrome.tabs.get(id).catch(() => null))?.active)
            await native.bind(id, t.windowId);
      } else native.disconnect();
      await saveTabs();
      for (const [id, t] of tabs)
        if (
          !(
            settings.enabled &&
            t.snapshot.nativeFullscreen &&
            controller.sessions.get(t.windowId)?.phase === "manual"
          ) &&
          (ineligible(t.snapshot, settings) ||
            (settings.autoExit &&
              t.pointer.inside &&
              controller.sessions.get(t.windowId)?.trigger !== "idle"))
        )
          await exit(t.windowId);
    });
});
chrome.windows.onBoundsChanged.addListener((w) => {
  void queue(async () => {
    const s = controller.sessions.get(w.id!);
    if (
      s &&
      !s.native &&
      (await chrome.windows.get(w.id!).catch(() => null))?.state !==
        "fullscreen"
    ) {
      if (settings.debug) console.debug('[Auto Fullscreen] External window exit',{windowId:w.id,phase:s.phase,trigger:s.trigger});
      const t = tabs.get(s.tabId);
      if (t && s.phase !== 'exiting') t.pointer = { inside: false, armed: false, blocked: true };
      await saveTabs();
      await exit(w.id!, false);
    }
  });
});
chrome.tabs.onActivated.addListener((a) => {
  void queue(async () => {
    const s = controller.sessions.get(a.windowId);
    if (s && s.tabId !== a.tabId) await exit(a.windowId);
    for (const [id, t] of tabs)
      if (t.windowId === a.windowId) {
        cancel(id);
        t.pointer = { inside: false, armed: false, blocked: t.pointer.blocked };
      }
    await saveTabs();
    if (settings.detection === "helper" && tabs.has(a.tabId)) {
      await native.bind(a.tabId, a.windowId);
      const p = await native.request({ type: "check", windowId: a.windowId });
      if (p.ok && p.inside === true) await edge(a.tabId, true);
    }
  });
});
chrome.tabs.onRemoved.addListener((id) => {
  void queue(async () => {
    cancel(id);
    const t = tabs.get(id);
    if (t && controller.sessions.get(t.windowId)?.tabId === id)
      await exit(t.windowId);
    tabs.delete(id);
  });
});
chrome.tabs.onUpdated.addListener((id, change) => {
  if (change.status === "loading")
    void queue(async () => {
      cancel(id);
      const t = tabs.get(id);
      if (t && controller.sessions.get(t.windowId)?.tabId === id)
        await exit(t.windowId);
      tabs.delete(id);
    });
});
chrome.tabs.onDetached.addListener((id) => {
  void queue(async () => {
    cancel(id);
    const t = tabs.get(id);
    if (t) await exit(t.windowId);
    tabs.delete(id);
  });
});
chrome.windows.onRemoved.addListener((id) => {
  void queue(async () => {
    await exit(id);
    native.bound.delete(id);
    await native.request({ type: "forget", windowId: id });
    for (const [tid, t] of tabs)
      if (t.windowId === id) {
        cancel(tid);
        tabs.delete(tid);
      }
  });
});
chrome.alarms.onAlarm.addListener(() => {
  void queue(async () => {
    for (const [wid, s] of controller.sessions) {
      const tab = await chrome.tabs.get(s.tabId).catch(() => null);
      const snap = await chrome.tabs
        .sendMessage(s.tabId, { type: "snapshot" })
        .catch(() => null);
      if (
        s.phase === "manual" &&
        snap?.nativeFullscreen &&
        tab?.active &&
        settings.enabled
      )
        continue;
      if (
        s.phase === "exiting" ||
        s.phase === "manual" ||
        !tab?.active ||
        !snap ||
        (ineligible(snap, settings) && !(s.native && snap.nativeFullscreen))
      )
        await exit(wid);
    }
  });
});
