import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  ChevronRight,
  Expand,
  Monitor,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Volume2,
} from "lucide-react";
import { defaults, getSettings, normalize } from "../shared/settings";
import type { Settings, Session, TabState } from "../shared/types";
import { bundledFonts, fontFaces } from "../shared/fonts";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "./style.css";
const extension = typeof chrome !== "undefined" && !!chrome.storage;
const fontStyle = document.createElement("style");
fontStyle.textContent = fontFaces(extension ? chrome.runtime.getURL("") : "/");
document.head.append(fontStyle);
type Status = {
  tabs: (TabState & { id: number })[];
  sessions: Session[];
  helper: string;
  bound: number[];
};
const initial: Status = {
  tabs: [],
  sessions: [],
  helper: extension ? "Checking…" : "UI preview · no browser connection",
  bound: [],
};
function Toggle({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`toggle ${value ? "on" : ""}`}
      role="switch"
      aria-checked={value}
      aria-label={label}
      onClick={() => onChange(!value)}
    >
      <span />
    </button>
  );
}
function App() {
  const [s, setS] = useState(defaults),
    [status, setStatus] = useState(initial),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [loaded, setLoaded] = useState(false),
    [current, setCurrent] = useState<number>(),
    [preview, setPreview] = useState(0),
    [previewExit, setPreviewExit] = useState(false);
  const writes = useRef(Promise.resolve());
  const isOptions = location.pathname.includes("options");
  useEffect(() => {
    void (
      extension
        ? getSettings()
        : Promise.resolve(
            normalize(JSON.parse(localStorage.getItem("settings") || "null")),
          )
    )
      .then((v) => {
        setS(v);
        setLoaded(true);
      })
      .catch((e) => setError(String(e)));
    const poll = () => {
      if (extension)
        void chrome.runtime
          .sendMessage({ type: "status" })
          .then((v) => {
            if (v?.error) throw Error(v.error);
            if (v) setStatus(v);
          })
          .catch((e) => setError(String(e)));
    };
    poll();
    const timer = setInterval(poll, 2000);
    if (extension)
      void chrome.tabs
        .query({ active: true, currentWindow: true })
        .then((t) => setCurrent(t[0]?.id));
    const change = (
      c: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === "local" && c.settings) setS(normalize(c.settings.newValue));
    };
    if (extension) chrome.storage.onChanged.addListener(change);
    return () => {
      clearInterval(timer);
      if (extension) chrome.storage.onChanged.removeListener(change);
    };
  }, []);
  function save(next: Settings) {
    next = normalize(next);
    setS(next);
    setSaved(false);
    setError("");
    writes.current = writes.current
      .then(async () => {
        if (extension) await chrome.storage.local.set({ settings: next });
        else localStorage.setItem("settings", JSON.stringify(next));
        setSaved(true);
      })
      .catch((e) => setError(String(e)));
  }
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    save({ ...s, [key]: value });
  const toast = <K extends keyof Settings["toast"]>(
    key: K,
    value: Settings["toast"][K],
  ) => save({ ...s, toast: { ...s.toast, [key]: value } });
  const tab = status.tabs.find((t) => t.id === current),
    session = status.sessions.find((t) => t.tabId === current);
  async function detection(value: string) {
    if (value === "helper" && extension) {
      try {
        if (
          !(await chrome.permissions.request({
            permissions: ["nativeMessaging"],
          }))
        ) {
          setError(
            "Native messaging permission was not granted. Detection is unchanged.",
          );
          return;
        }
      } catch (e) {
        setError(String(e));
        return;
      }
    }
    set("detection", value as Settings["detection"]);
  }
  function openOptions() {
    if (extension) void chrome.runtime.openOptionsPage();
    else location.href = "options.html";
  }
  const field = (label: string, child: React.ReactNode, hint?: string) => (
    <label className="field">
      <span>{label}</span>
      {child}
      {hint && <small>{hint}</small>}
    </label>
  );
  const number = (
    label: string,
    value: number,
    fn: (n: number) => void,
    min: number,
    max: number,
    step = 1,
  ) =>
    field(
      label,
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        defaultValue={value}
        key={value}
        onBlur={(e) => fn(Number(e.target.value))}
      />,
    );
  const select = (
    label: string,
    value: string,
    fn: (v: string) => void,
    values: [string, string][],
  ) =>
    field(
      label,
      <select value={value} onChange={(e) => fn(e.target.value)}>
        {values.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>,
    );
  const row = (
    title: string,
    desc: string,
    value: boolean,
    fn: (v: boolean) => void,
  ) => (
    <div className="setting-row">
      <div>
        <strong>{title}</strong>
        <p>{desc}</p>
      </div>
      <Toggle label={title} value={value} onChange={fn} />
    </div>
  );
  if (!loaded)
    return (
      <main className="loading">
        Loading your settings…{error && <p role="alert">{error}</p>}
      </main>
    );
  if (!isOptions)
    return (
      <main className="popup">
        <header>
          <div className="brand-icon">
            <Expand size={23} />
          </div>
          <div>
            <h1>Auto Fullscreen</h1>
            <span className="eyebrow">MADE FOR YOUR NEXT MONITOR</span>
          </div>
          <button
            className="icon-button"
            title="Open settings"
            aria-label="Open settings"
            onClick={openOptions}
          >
            <Settings2 size={19} />
          </button>
        </header>
        <div className="enabled-card">
          <div>
            <span className={`dot ${s.enabled ? "green" : ""}`} />
            <strong>
              {s.enabled
                ? "Automatic fullscreen is on"
                : "Automatic fullscreen is off"}
            </strong>
            <p>Your video. A little more space.</p>
          </div>
          <Toggle
            label="Enable automatic fullscreen"
            value={s.enabled}
            onChange={(v) => set("enabled", v)}
          />
        </div>
        <section className="popup-status">
          <div className="section-label">
            CURRENT TAB{" "}
            <span className="pill">{tab ? "YOUTUBE" : "NO VIDEO"}</span>
          </div>
          <div className="video-status">
            <div className="video-icon">
              {tab?.snapshot.playing ? <Play size={22} /> : <Pause size={22} />}
            </div>
            <div>
              <h2>
                {tab
                  ? tab.snapshot.playing
                    ? "Video is playing"
                    : "Video is paused"
                  : "Open a YouTube video"}
              </h2>
              <p>
                {tab
                  ? "Watching in this window"
                  : "Choose a video to get started"}
              </p>
            </div>
          </div>
          <dl>
            <div>
              <dt>Eligibility</dt>
              <dd>{tab?.reason || "Waiting for a watch page"}</dd>
            </div>
            <div>
              <dt>Fullscreen</dt>
              <dd>
                {session
                  ? session.phase === "manual"
                    ? "Manual · YouTube"
                    : session.trigger === "idle"
                      ? "Automatic · inactivity"
                      : "Automatic · window"
                  : tab?.snapshot.nativeFullscreen
                    ? "Manual · YouTube"
                    : "Inactive"}
              </dd>
            </div>
            <div>
              <dt>Detection</dt>
              <dd>
                {s.detection === "helper"
                  ? "Windows helper"
                  : "Page boundary (limited)"}
              </dd>
            </div>
          </dl>
        </section>
        <div className="info-note">
          <MousePointer2 size={18} />
          <p>
            {s.detection === "browser"
              ? "Browser mode detects leaving the webpage, including moving to the toolbar. Use the Windows helper for accurate window boundaries."
              : `Helper: ${status.helper}. Return to the video window to restore it.`}
          </p>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="settings-link" onClick={openOptions}>
          <span>
            <Settings2 size={16} /> Customize your experience
          </span>
          <ChevronRight size={17} />
        </button>
        <footer>
          <span className="dot green" /> LOCAL ONLY <span>v1.0.0</span>
        </footer>
      </main>
    );
  return (
    <div className="settings-shell">
      <aside>
        <a className="brand" href="#general">
          <div className="brand-icon">
            <Expand size={24} />
          </div>
          <span>
            Auto Fullscreen<small>FOR YOUTUBE</small>
          </span>
        </a>
        <div className="nav-label">YOUR EXPERIENCE</div>
        <nav>
          <a href="#general">
            <Settings2 size={18} /> General
          </a>
          <a href="#notifications">
            <Sparkles size={18} /> Notifications
          </a>
          <a href="#advanced">
            <Monitor size={18} /> Advanced
          </a>
        </nav>
        <div className="sidebar-bottom">
          <ShieldCheck size={20} />
          <strong>Private by design</strong>
          <p>
            Your settings stay on this device.
            <br />
            No accounts. No analytics.
          </p>
          <small>VERSION 1.0.0</small>
        </div>
      </aside>
      <main className="settings-main">
        <header className="page-header">
          <div>
            <div className="eyebrow accent">LESS CHROME. MORE VIDEO.</div>
            <h1>Make room for watching.</h1>
            <p>Fullscreen that follows your workflow, one window at a time.</p>
          </div>
          <span className="save-state">
            <Check size={15} />
            {saved ? "Changes saved" : "Saved on this device"}
          </span>
        </header>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <section id="general">
          <div className="section-heading">
            <div className="section-number">01</div>
            <div>
              <h2>General</h2>
              <p>The right moment to go fullscreen.</p>
            </div>
          </div>
          <div className="card">
            {row(
              "Automatic fullscreen",
              "Expand a playing video on pointer exit or page inactivity.",
              s.enabled,
              (v) => set("enabled", v),
            )}
            {row(
              "Restore on return",
              "Restore pointer-exit sessions on return. Idle sessions stay fullscreen until you interact.",
              s.autoExit,
              (v) => set("autoExit", v),
            )}
            {row(
              "Fullscreen when the mouse is still",
              "Track only this YouTube page. Click, scroll, type, or press Escape to exit an idle session.",
              s.idleEnabled,
              (v) => set("idleEnabled", v),
            )}
            <div className="form-grid">
              {number(
                "Top-of-page threshold · px",
                s.threshold,
                (v) => set("threshold", v),
                0,
                500,
              )}
              {number(
                "Pointer-exit delay · seconds",
                s.delay,
                (v) => set("delay", v),
                0,
                10,
                0.1,
              )}
              {number(
                "Page inactivity delay · seconds",
                s.idleDelay,
                (v) => set("idleDelay", v),
                1,
                300,
                0.5,
              )}
              {select(
                "After a manual exit",
                s.manualOverride,
                (v) => set("manualOverride", v as Settings["manualOverride"]),
                [
                  ["return-leave", "Wait for return, then leave"],
                  ["navigation", "Wait for the next video"],
                ],
              )}
            </div>
            <div className="card-note">
              <ShieldCheck size={16} />
              <span>
                Paused videos, comments, search, Picture-in-Picture, and manual
                fullscreen are protected.
              </span>
            </div>
          </div>
        </section>
        <section id="notifications">
          <div className="section-heading">
            <div className="section-number">02</div>
            <div>
              <h2>Notifications</h2>
              <p>A small signal, made yours.</p>
            </div>
          </div>
          <div className="preview-stage">
            <div className="preview-meta">
              <span>
                <span className="dot green" /> LIVE PREVIEW
              </span>
              <button onClick={() => setPreview((v) => v + 1)}>
                <RotateCcw size={14} /> Replay
              </button>
            </div>
            <div className="landscape">
              <div className="sun" />
              <div className="mountain back" />
              <div className="mountain front" />
            </div>
            <div
              className={`preview-toast position-${s.toast.position} animation-${s.toast.animation}`}
              key={preview + JSON.stringify(s.toast)}
              style={{
                fontFamily: s.toast.font,
                fontSize: s.toast.size,
                fontWeight: s.toast.weight,
                color: s.toast.color,
                background: s.toast.background,
                borderRadius: s.toast.radius,
                opacity: s.toast.enabled ? 1 : 0,
              }}
            >
              <Expand size={19} />
              {previewExit ? s.toast.exit : s.toast.enter}
            </div>
            <div className="preview-controls">
              <Play size={14} />
              <span className="preview-track" />
              <Volume2 size={16} />
              <Expand size={16} />
            </div>
          </div>
          <div className="preview-caption">
            <span>Appearance preview · toast stays visible here</span>
            <button
              onClick={() => {
                setPreviewExit((v) => !v);
                setPreview((v) => v + 1);
              }}
            >
              {previewExit ? "Show activation" : "Show deactivation"}{" "}
              <ArrowUpRight size={13} />
            </button>
          </div>
          <div className="card">
            {row(
              "Show notifications",
              "A quiet confirmation when fullscreen changes.",
              s.toast.enabled,
              (v) => toast("enabled", v),
            )}
            <div className="form-grid">
              {field(
                "Activation message",
                <input
                  maxLength={160}
                  value={s.toast.enter}
                  onChange={(e) => toast("enter", e.target.value)}
                />,
              )}
              {field(
                "Deactivation message",
                <input
                  maxLength={160}
                  value={s.toast.exit}
                  onChange={(e) => toast("exit", e.target.value)}
                />,
              )}
              {select(
                "Position",
                s.toast.position,
                (v) => toast("position", v as Settings["toast"]["position"]),
                [
                  ["top", "Top center"],
                  ["bottom", "Bottom center"],
                  ["center", "Center"],
                  ["top-left", "Top left"],
                  ["top-right", "Top right"],
                  ["bottom-left", "Bottom left"],
                  ["bottom-right", "Bottom right"],
                ],
              )}
              {field(
                "Font family",
                <input
                  list="fonts"
                  value={s.toast.font}
                  onChange={(e) => toast("font", e.target.value)}
                />,
                "Inter is bundled. Other names use locally installed fonts.",
              )}
              <datalist id="fonts">
                {bundledFonts.map((f) => (
                  <option key={f.family}>{f.family}</option>
                ))}
                <option>Segoe UI</option>
                <option>Arial</option>
                <option>Georgia</option>
                <option>monospace</option>
              </datalist>
              {number(
                "Font size · px",
                s.toast.size,
                (v) => toast("size", v),
                10,
                48,
              )}
              {number(
                "Font weight",
                s.toast.weight,
                (v) => toast("weight", v),
                100,
                900,
                100,
              )}
              {field(
                "Text color",
                <div className="color-input">
                  <input
                    aria-label="Text color picker"
                    type="color"
                    value={s.toast.color.slice(0, 7)}
                    onChange={(e) => toast("color", e.target.value)}
                  />
                  <input
                    aria-label="Text color hex"
                    defaultValue={s.toast.color}
                    key={s.toast.color}
                    onBlur={(e) => toast("color", e.target.value)}
                  />
                </div>,
              )}
              {field(
                "Background color · #RRGGBB[AA]",
                <div className="color-input">
                  <input
                    aria-label="Background color picker"
                    type="color"
                    value={s.toast.background.slice(0, 7)}
                    onChange={(e) => toast("background", e.target.value + "e6")}
                  />
                  <input
                    aria-label="Background hex including opacity"
                    defaultValue={s.toast.background}
                    key={s.toast.background}
                    onBlur={(e) => toast("background", e.target.value)}
                  />
                </div>,
              )}
              {number(
                "Corner radius · px",
                s.toast.radius,
                (v) => toast("radius", v),
                0,
                48,
              )}
              {number(
                "Duration · milliseconds",
                s.toast.duration,
                (v) => toast("duration", v),
                250,
                10000,
                250,
              )}
              {select(
                "Animation",
                s.toast.animation,
                (v) => toast("animation", v as Settings["toast"]["animation"]),
                [
                  ["slide", "Fade + slide"],
                  ["fade", "Fade"],
                  ["none", "None"],
                ],
              )}
            </div>
          </div>
        </section>
        <section id="advanced">
          <div className="section-heading">
            <div className="section-number">03</div>
            <div>
              <h2>Advanced</h2>
              <p>Know exactly what is happening.</p>
            </div>
          </div>
          <div className="card">
            <div className="form-grid">
              {field(
                "Fullscreen strategy",
                <select value="window" disabled>
                  <option value="window">
                    True window fullscreen + expanded player
                  </option>
                </select>,
                "Native YouTube fullscreen requires a user gesture and cannot reliably run on pointer exit.",
              )}
              {select(
                "Pointer detection",
                s.detection,
                (v) => void detection(v),
                [
                  ["browser", "Browser only · webpage boundary"],
                  ["helper", "Windows helper · actual window"],
                ],
              )}
            </div>
            <div className="info-note inset">
              <MousePointer2 size={19} />
              <p>
                {s.detection === "browser"
                  ? "Page events cannot distinguish the address bar from another monitor. Browser-only mode is approximate. For the three-monitor workflow, install the optional helper using helper/install.ps1, then select Windows helper."
                  : "The helper reads the window under the pointer locally. It does not use inactivity or keyboard focus. Installation instructions are in the project README."}
              </p>
            </div>
            {row(
              "Debug logging",
              "Write transition errors to the extension service worker console.",
              s.debug,
              (v) => set("debug", v),
            )}
            <div className="diagnostics">
              <div className="section-label">
                MULTI-MONITOR DIAGNOSTICS{" "}
                <button
                  onClick={() => {
                    if (extension)
                      void chrome.runtime
                        .sendMessage({ type: "reconnect" })
                        .catch((e) => setError(String(e)));
                  }}
                >
                  Reconnect helper <RotateCcw size={13} />
                </button>
              </div>
              <p>{status.helper}</p>
              <p className="muted">
                {status.bound.length} bound windows · {status.sessions.length}{" "}
                automatic sessions · {status.tabs.length} tracked tabs
              </p>
              {status.tabs.map((t) => (
                <div className="diagnostic-row" key={t.id}>
                  <Monitor size={16} />
                  <div>
                    <strong>
                      Window {t.windowId} / tab {t.id}
                    </strong>
                    <p>{t.reason}</p>
                  </div>
                  <span className="pill">
                    {t.pointer.inside ? "INSIDE" : "OUTSIDE / UNKNOWN"}
                  </span>
                </div>
              ))}
            </div>
            <div className="setting-row">
              <div>
                <strong>Start fresh</strong>
                <p>Restore all settings to their defaults.</p>
              </div>
              <button className="secondary" onClick={() => save(defaults)}>
                <RotateCcw size={15} /> Reset settings
              </button>
            </div>
          </div>
        </section>
        <footer className="settings-footer">
          <span>
            <ShieldCheck size={15} /> Built for focus. Stored locally.
          </span>
          <a href="#general">
            Back to top <ArrowDown size={14} className="flip" />
          </a>
        </footer>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
