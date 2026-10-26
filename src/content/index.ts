import { defaults, getSettings } from "../shared/settings";
import { ineligible } from "../shared/machine";
import { readSnapshot, observePlayback, setPointerHeld } from "./playback";
import { ToastManager } from "./toast";
import { PageInactivity } from "./inactivity";
let settings = defaults,
  active = false,
  prepared = false,
  dead = false,
  last = "",
  titleBackup = "",
  titleToken = "";
let activationTrigger: "leave" | "idle" = "leave";
const toast = new ToastManager(),
  listeners = new AbortController();
const inactivity = new PageInactivity(
  () =>
    !dead &&
    !active &&
    !prepared &&
    settings.idleEnabled &&
    !ineligible(readSnapshot(), settings),
  () => settings.idleDelay * 1000,
  (idleTicket) => {
    void send({ type: "idle", idleTicket });
  },
);
const style = document.createElement("style");
style.textContent = `
 html.afs-fullscreen,html.afs-fullscreen body{overflow:hidden!important}
 html.afs-fullscreen ytd-app{visibility:hidden!important}
 html.afs-fullscreen #movie_player,html.afs-fullscreen #movie_player *{visibility:visible!important}
 html.afs-fullscreen #movie_player{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;z-index:2147483646!important;background:#000!important;border-radius:0!important}
 html.afs-fullscreen #movie_player video{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;object-fit:contain!important}
 html.afs-fullscreen #movie_player .html5-video-container{position:absolute!important;inset:0!important;width:100%!important;height:100%!important}
 html.afs-fullscreen ytd-watch-flexy,html.afs-fullscreen #player,html.afs-fullscreen #player-container,html.afs-fullscreen #player-container-outer,html.afs-fullscreen #player-container-inner,html.afs-fullscreen ytd-player{transform:none!important;contain:none!important;overflow:visible!important}
 html.afs-fullscreen #movie_player .ytp-chrome-bottom{width:calc(100% - 24px)!important;left:12px!important}
`;
document.documentElement.append(style);
function restore() {
  inactivity.suspend();
  document.documentElement.classList.remove("afs-fullscreen");
  prepared = false;
  active = false;
}
function shutdown() {
  dead = true;
  restore();
  toast.clear();
  stopPlayback();
  listeners.abort();
  clearInterval(lease);
  style.remove();
}
async function send(m: object) {
  if (dead) return;
  try {
    return await chrome.runtime.sendMessage(m);
  } catch {
    shutdown();
  }
}
function publish() {
  if (dead) return;
  inactivity.sync();
  const snapshot = readSnapshot(),
    next = JSON.stringify(snapshot);
  if (next !== last) {
    last = next;
    void send({ type: "state", snapshot });
  }
}
const stopPlayback = observePlayback(publish);
const on = (
  target: EventTarget,
  event: string,
  fn: EventListener,
  opts: AddEventListenerOptions = {},
) => target.addEventListener(event, fn, { ...opts, signal: listeners.signal });
let pointerInside = false;
function interact() {
  inactivity.suspend();
  if ((active || prepared) && activationTrigger === "idle")
    void send({ type: "interact" });
}
for (const event of ["pointerdown", "pointerup", "pointercancel"])
  on(
    document,
    event,
    (e) => {
      if (!e.isTrusted) return;
      if (event === "pointerdown") interact();
      setPointerHeld(event === "pointerdown");
      publish();
    },
    { capture: true, passive: true },
  );
on(document, "pointerout", (e) => {
  if (!(e as PointerEvent).isTrusted || (e as PointerEvent).relatedTarget)
    return;
  pointerInside = false;
  inactivity.leave();
  publish();
  void send({ type: "pointer", inside: false });
});
on(
  document,
  "pointermove",
  (e) => {
    const p = e as PointerEvent;
    if (!p.isTrusted || (!p.movementX && !p.movementY)) return;
    setPointerHeld(p.buttons !== 0);
    publish();
    if (!pointerInside) {
      pointerInside = true;
      void send({ type: "pointer", inside: true });
    }
    if (p.pointerType === "mouse") {
      // Only idle-owned fullscreen exits on motion; leave-owned fullscreen
      // continues to use the existing window-boundary return behavior.
      if ((active || prepared) && activationTrigger === "idle") {
        interact();
        return;
      }
      inactivity.move();
    }
  },
  { passive: true },
);
on(
  document,
  "wheel",
  (e) => {
    if (e.isTrusted) interact();
  },
  { capture: true, passive: true },
);
on(
  window,
  "keydown",
  (e) => {
    if (!e.isTrusted) return;
    if ((e as KeyboardEvent).key === "Escape" && (active || prepared)) {
      void send({ type: "escape" });
      restore();
    } else if (
      !["Shift", "Control", "Alt", "Meta"].includes((e as KeyboardEvent).key)
    )
      interact();
  },
  { capture: true },
);
for (const event of [
  "scroll",
  "focusin",
  "focusout",
  "visibilitychange",
  "fullscreenchange",
  "yt-navigate-finish",
  "yt-page-data-updated",
])
  on(
    document,
    event,
    () => {
      if (document.hidden) inactivity.leave();
      publish();
    },
    { passive: true },
  );
on(window, "popstate", () => publish());
on(document, "yt-navigate-start", () => {
  if (active || prepared) {
    void send({ type: "escape" });
    restore();
  }
  last = "";
});
chrome.runtime.onMessage.addListener((m, _sender, reply) => {
  if (m.type === "idle-check") {
    reply({ ok: inactivity.ready(m.idleTicket) });
    return;
  }
  if (m.type === "snapshot") {
    reply(readSnapshot());
    return;
  }
  if (m.type === "prepare") {
    if (
      !ineligible(readSnapshot(), settings) &&
      (m.trigger !== "idle" || inactivity.ready(m.idleTicket)) &&
      document.querySelector("#movie_player")
    ) {
      activationTrigger = m.trigger === "idle" ? "idle" : "leave";
      prepared = true;
      document.documentElement.classList.add("afs-fullscreen");
      reply({ ok: true });
    } else reply({ ok: false });
    return;
  }
  if (m.type === "activated") {
    activationTrigger = m.trigger === "idle" ? "idle" : "leave";
    active = true;
    inactivity.suspend();
    toast.show(settings.toast.enter, settings.toast, true);
  }
  if (m.type === "deactivate") {
    const was = active;
    restore();
    if (was) toast.show(settings.toast.exit, settings.toast, false);
  }
  if (m.type === "manual-overlay") restore();
  if (m.type === "bind-title") {
    titleBackup = document.title;
    titleToken = m.token;
    document.title = `${titleBackup} [${titleToken}]`;
    const token = titleToken,
      original = titleBackup;
    setTimeout(() => {
      if (titleToken === token) {
        if (document.title.endsWith(`[${token}]`)) document.title = original;
        titleToken = "";
      }
    }, 3500);
  }
  if (m.type === "unbind-title" && titleToken === m.token) {
    if (document.title.endsWith(`[${titleToken}]`))
      document.title = titleBackup;
    titleToken = "";
  }
  reply({ ok: true });
});
chrome.storage.onChanged.addListener((c, area) => {
  if (area === "local" && c.settings)
    void getSettings().then((s) => {
      settings = s;
      inactivity.refresh();
      publish();
    });
});
void getSettings().then((s) => {
  settings = s;
  inactivity.refresh();
  last = "";
  publish();
});
// Only while expanded, detect an invalidated extension context and remove page styles.
// A disabled browser-only extension cannot call chrome.windows to restore the browser UI.
const lease = setInterval(() => {
  if (active || prepared) void send({ type: "health" });
}, 2000);
on(window, "pagehide", () => {
  restore();
  toast.clear();
});
