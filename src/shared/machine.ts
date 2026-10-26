import type { PointerState, Settings, Snapshot } from "./types";
export function ineligible(s: Snapshot, c: Settings): string | null {
  if (!c.enabled) return "Automatic fullscreen is off";
  if (!s.watch) return "Open a YouTube watch page";
  if (!s.visible) return "YouTube tab is not visible";
  if (!s.playing) return "Video is paused, ended, or not ready";
  if (s.pip) return "Picture-in-Picture is active";
  if (s.nativeFullscreen) return "Manual fullscreen is active";
  if (s.scroll > c.threshold) return "Scroll to the top, then leave again";
  if (s.editing) return "Search or text input is active";
  return null;
}
// Only a new inside → outside edge can request entry. Playback and scroll changes never do.
export function pointerEdge(
  p: PointerState,
  inside: boolean,
): { state: PointerState; enter: boolean } {
  if (inside)
    return {
      state: { inside: true, armed: true, blocked: false },
      enter: false,
    };
  const enter = p.inside && p.armed && !p.blocked;
  return { state: { ...p, inside: false, armed: false }, enter };
}
