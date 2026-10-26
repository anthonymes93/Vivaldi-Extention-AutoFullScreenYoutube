import type { Snapshot } from "../shared/types";
let pointerHeld = false;
export function setPointerHeld(held: boolean) {
  pointerHeld = held;
}
export function readSnapshot(): Snapshot {
  const video = document.querySelector<HTMLVideoElement>("#movie_player video");
  const el = document.activeElement;
  return {
    watch:
      location.pathname === "/watch" &&
      !!new URL(location.href).searchParams.get("v"),
    playing: !!video && !video.paused && !video.ended && video.readyState >= 2,
    pip: !!document.pictureInPictureElement,
    nativeFullscreen: !!document.fullscreenElement,
    scroll: window.scrollY,
    editing:
      pointerHeld ||
      !!el?.matches('input,textarea,[contenteditable="true"],[role="textbox"]'),
    visible: !document.hidden,
    url: location.href,
  };
}
export function observePlayback(changed: () => void) {
  let video: HTMLVideoElement | null = null;
  let queued = false;
  const events = [
    "play",
    "playing",
    "pause",
    "ended",
    "emptied",
    "loadeddata",
    "enterpictureinpicture",
    "leavepictureinpicture",
  ];
  const bind = () => {
    const next = document.querySelector<HTMLVideoElement>(
      "#movie_player video",
    );
    if (next !== video) {
      events.forEach((e) => video?.removeEventListener(e, changed));
      video = next;
      events.forEach((e) => video?.addEventListener(e, changed));
      changed();
    }
  };
  const observer = new MutationObserver(() => {
    if (!queued) {
      queued = true;
      queueMicrotask(() => {
        queued = false;
        bind();
      });
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  bind();
  return () => {
    observer.disconnect();
    events.forEach((e) => video?.removeEventListener(e, changed));
  };
}
