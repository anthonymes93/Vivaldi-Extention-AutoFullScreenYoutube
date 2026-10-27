export type Settings = {
  enabled: boolean;
  autoExit: boolean;
  threshold: number;
  delay: number;
  idleEnabled: boolean;
  idleDelay: number;
  manualOverride: "return-leave" | "navigation";
  detection: "browser" | "helper";
  debug: boolean;
  toast: {
    enabled: boolean;
    enter: string;
    exit: string;
    font: string;
    size: number;
    weight: number;
    color: string;
    background: string;
    radius: number;
    position:
      | "top"
      | "bottom"
      | "center"
      | "top-left"
      | "top-right"
      | "bottom-left"
      | "bottom-right";
    duration: number;
    animation: "slide" | "fade" | "none";
  };
};
export type Snapshot = {
  watch: boolean;
  playing: boolean;
  pip: boolean;
  nativeFullscreen: boolean;
  scroll: number;
  editing: boolean;
  visible: boolean;
  url: string;
};
export type Session = {
  native?: boolean;
  trigger: "leave" | "idle";
  tabId: number;
  windowId: number;
  phase: "entering" | "active" | "manual" | "exiting";
  original: {
    state: "normal" | "maximized";
    left?: number;
    top?: number;
    width?: number;
    height?: number;
  };
};
export type PointerState = {
  inside: boolean;
  armed: boolean;
  blocked: boolean;
};
export type TabState = {
  snapshot: Snapshot;
  pointer: PointerState;
  windowId: number;
  reason?: string;
};
