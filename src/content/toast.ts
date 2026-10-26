import type { Settings } from "../shared/types";
import { fontFaces } from "../shared/fonts";
export class ToastManager {
  host: HTMLDivElement | null = null;
  timer: ReturnType<typeof setTimeout> | undefined;
  show(message: string, s: Settings["toast"], enter: boolean) {
    this.clear();
    if (!s.enabled) return;
    const host = document.createElement("div");
    this.host = host;
    host.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;pointer-events:none;visibility:visible";
    const root = host.attachShadow({ mode: "closed" }),
      style = document.createElement("style");
    style.textContent = `${fontFaces(chrome.runtime.getURL(""))} .toast{position:absolute;display:flex;align-items:center;gap:10px;padding:13px 18px;max-width:calc(100vw - 48px);box-sizing:border-box;overflow-wrap:anywhere;box-shadow:0 12px 40px #0005;border:1px solid #ffffff18;backdrop-filter:blur(16px);line-height:1.5}svg{width:19px;height:19px;flex-shrink:0}`;
    const box = document.createElement("div");
    box.className = "toast";
    box.setAttribute("role", "status");
    Object.assign(box.style, {
      fontFamily: s.font,
      fontSize: `${s.size}px`,
      fontWeight: String(s.weight),
      color: s.color,
      background: s.background,
      borderRadius: `${s.radius}px`,
    });
    const p = s.position;
    box.style.top = p.includes("top") ? "28px" : p === "center" ? "50%" : "";
    box.style.bottom = p.includes("bottom") ? "28px" : "";
    box.style.left = p.includes("left")
      ? "28px"
      : p.includes("right")
        ? ""
        : "50%";
    box.style.right = p.includes("right") ? "28px" : "";
    box.style.transform =
      p === "center"
        ? "translate(-50%, -50%)"
        : !p.includes("left") && !p.includes("right")
          ? "translateX(-50%)"
          : "";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute(
      "d",
      enter
        ? "M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3"
        : "M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3m8 0v-3a2 2 0 0 1 2-2h3",
    );
    svg.append(path);
    const text = document.createElement("span");
    text.textContent = message;
    box.append(svg, text);
    root.append(style, box);
    (document.fullscreenElement || document.documentElement).append(host);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (s.animation !== "none" && !reduced)
      box.animate(
        [
          { opacity: 0, translate: s.animation === "slide" ? "0 10px" : "0 0" },
          { opacity: 1, translate: "0 0" },
        ],
        { duration: 220, easing: "ease-out" },
      );
    this.timer = setTimeout(() => {
      if (s.animation === "none" || reduced) this.clear();
      else {
        const a = box.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 180,
          fill: "forwards",
        });
        a.onfinish = () => {
          if (this.host === host) this.clear();
        };
      }
    }, s.duration);
  }
  clear() {
    clearTimeout(this.timer);
    this.host?.remove();
    this.host = null;
  }
}
