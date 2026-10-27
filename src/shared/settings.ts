import type { Settings } from "./types";
export const defaults: Settings = {
  enabled: true,
  autoExit: true,
  threshold: 20,
  delay: 0,
  idleEnabled: true,
  idleDelay: 3,
  manualOverride: "return-leave",
  detection: "browser",
  debug: false,
  toast: {
    enabled: true,
    enter: "Full screen activated",
    exit: "Full screen deactivated",
    font: "Inter",
    size: 14,
    weight: 500,
    color: "#f4f4f5",
    background: "#18181be6",
    radius: 14,
    position: "bottom",
    duration: 2000,
    animation: "slide",
  },
};
const num = (v: unknown, d: number, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.max(min, Math.min(max, v))
    : d;
export function normalize(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Settings>;
  const t = r.toast || defaults.toast;
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const str = (v: unknown, d: string) =>
    typeof v === "string" ? v.slice(0, 160) : d;
  return {
    enabled: bool(r.enabled, true),
    autoExit: bool(r.autoExit, true),
    threshold: num(r.threshold, 20, 0, 500),
    delay: num(r.delay, 0, 0, 10),
    idleEnabled: bool(r.idleEnabled, true),
    idleDelay: num(r.idleDelay, 3, 1, 300),
    manualOverride:
      r.manualOverride === "navigation" ? "navigation" : "return-leave",
    detection: r.detection === "helper" ? "helper" : "browser",
    debug: bool(r.debug, false),
    toast: {
      enabled: bool(t.enabled, true),
      enter: str(t.enter, defaults.toast.enter),
      exit: str(t.exit, defaults.toast.exit),
      font: str(t.font, "Inter"),
      size: num(t.size, 14, 10, 48),
      weight: num(t.weight, 500, 100, 900),
      color: /^#[\da-f]{6}([\da-f]{2})?$/i.test(t.color)
        ? t.color
        : defaults.toast.color,
      background: /^#[\da-f]{6}([\da-f]{2})?$/i.test(t.background)
        ? t.background
        : defaults.toast.background,
      radius: num(t.radius, 14, 0, 48),
      position: [
        "top",
        "bottom",
        "center",
        "top-left",
        "top-right",
        "bottom-left",
        "bottom-right",
      ].includes(t.position)
        ? t.position
        : "bottom",
      duration: num(t.duration, 2000, 250, 10000),
      animation: ["slide", "fade", "none"].includes(t.animation)
        ? t.animation
        : "slide",
    },
  };
}
export async function getSettings() {
  const stored = await chrome.storage.local.get(["settings", "idleDelayV3Migrated"]);
  const settings = normalize(stored.settings);
  // One-time upgrade of the old 5-second default. Preserve other custom delays.
  if (!stored.idleDelayV3Migrated) {
    if (settings.idleDelay === 5) {
      settings.idleDelay = 3;
      await chrome.storage.local.set({ settings });
    }
    await chrome.storage.local.set({ idleDelayV3Migrated: true });
  }
  return settings;
}
