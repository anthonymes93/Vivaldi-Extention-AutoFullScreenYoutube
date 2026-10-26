# Auto Fullscreen for YouTube

A local Manifest V3 extension for Chromium browsers, designed for Vivaldi on Windows 11. TypeScript, React, Tailwind CSS v4, Lucide, and Vite. No account, server, analytics, remote scripts, or OS notifications.

The extension uses **real browser-window fullscreen** (`chrome.windows.update(windowId, {state: 'fullscreen'})`) plus an expanded, aspect-ratio-preserving YouTube player. It never selects a window using the current keyboard focus.

## Install

Prerequisite for building: Node.js 22.12+ and npm. The generated `dist/` folder is already built in this workspace.

```powershell
npm ci
npm run build
```

1. Open `vivaldi://extensions`.
2. Enable **Developer Mode**.
3. Choose **Load unpacked** and select this project's **dist** folder, not the project root.
4. Refresh existing YouTube tabs once to load the content script.
5. Pin **Auto Fullscreen** to the toolbar. Open its popup and settings.
6. Start a video on `https://www.youtube.com/watch?v=…`, stay at the top, move the pointer into the page, then leave it.

Rebuild after source changes, click **Reload** on the extension card, and refresh YouTube. Switch off automatic fullscreen before reloading an active browser-only session.

## Choose the right pointer detection

| Mode | What it detects | Important limitation |
| --- | --- | --- |
| Browser only (default) | Trusted pointer movement into the webpage and pointer exit from its document | Going to the address bar is also a page exit. It cannot identify the physical monitor or browser chrome. |
| Windows helper (recommended for three monitors) | The actual native window under the Windows pointer, including tabs and address bar | Requires local Python and native-host registration. Desktop operation still needs testing on your Vivaldi/display configuration. |

**The browser-only mode does not fully satisfy precise three-monitor tracking.** It is explicitly labeled in both interfaces. Neither mode uses loss of keyboard focus or global inactivity as a substitute for pointer exit. If helper mode is selected but unavailable, activation stops; there is no silent fallback.

### Optional Windows helper

The helper is needed for the exact window-boundary requirement. It is a small, standard-library-only Python process launched by native messaging, with no network access or administrator requirement. Install Python 3.8+ (a currently supported Python release is recommended), make `python.exe` available on PATH, and keep this project in a stable location.

1. Copy the 32-character extension ID from its `vivaldi://extensions` card.
2. In a PowerShell terminal in the project folder, run:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\helper\install.ps1 -ExtensionId YOUR_EXTENSION_ID
   ```

3. In extension settings, choose **Advanced → Pointer detection → Windows helper**. Accept the native messaging permission requested by that explicit action.
4. Activate each YouTube tab once. Under **Multi-monitor diagnostics**, look for **Connected** and the number of bound windows. If needed, select **Reconnect helper** with each YouTube tab active in its window.
5. Move into the window and then out to another monitor. Return to its visible fullscreen surface to restore it.

The installer registers only `com.autofullscreen.pointer` under the current user's Vivaldi and Chrome native-host keys and restricts allowed origins to the supplied extension ID. It creates a local launcher and manifest inside `helper/`. It does not install a startup task or background service. Moving the project or changing the extension ID requires rerunning installation. To remove registration, first choose browser-only detection, then run `powershell -NoProfile -File .\helper\uninstall.ps1`.

To bind an exact Chrome window ID to a native HWND without guessing monitor coordinates, the extension briefly appends a random token to the active tab's title. The helper requires one visible matching Vivaldi/Chrome/Edge process window, then retains its HWND and process ID. Ambiguous matches fail closed. Title-customization extensions or unusual Vivaldi title formats can prevent binding; diagnostics report this.

The helper samples `GetCursorPos`/`WindowFromPoint` every 40 ms and sends only per-window inside/outside changes. It ignores geometry changes under a stationary cursor. It does not capture keys, record coordinates to disk, move the pointer, or intentionally set foreground focus. Since fullscreen covers a monitor, returning to that fullscreen window detects returning to the monitor. Overlapping applications, OS overlays, split-monitor windows, Vivaldi tab tiling, Remote Desktop, and unusual display arrangements need separate validation; this is **window hit-testing**, not an unconditional monitor-presence trigger.

## Behavior and safeguards

- Entry requires a playing, non-ended video, an active/visible watch tab, no Picture-in-Picture or native fullscreen, no focused text/search input, and scroll position at or below the configured threshold (20 px by default).
- A new **inside → outside** pointer transition still triggers entry immediately (unless you configured a pointer-exit delay). Resuming playback, enabling the feature, returning to the top, or changing settings while already outside does not activate it.
- **Page inactivity** also enters fullscreen after the mouse stays still inside the YouTube page for five seconds. General settings provide an independent enable switch and a configurable 1–300 second inactivity delay. Every mouse movement restarts the full countdown. This is a document-local timer, not system-wide mouse inactivity; leaving the page cancels it and preserves the existing pointer-exit trigger.
- Both triggers use the same playback, top-of-page, search, PiP, active-tab, and manual-fullscreen safeguards. After playback resumes or the page becomes eligible again while the pointer is inside, inactivity waits a fresh full delay. Hidden tabs and pointer exits cancel their timers.
- Optional delay is canceled by return, navigation, changed eligibility, tab switch, or settings changes. Fresh eligibility is checked immediately before entry.
- Returning exits only pointer-exit-triggered fullscreen (when automatic exit is enabled). **Idle-triggered fullscreen stays active on mouse movement, leaving, and returning.** Click, scroll the wheel/trackpad, press a non-modifier key, or press Escape to exit it. Interactions are not swallowed. Existing manual YouTube or browser fullscreen is left alone.
- After an idle session exits, simply remaining still cannot re-enter it: fresh movement starts a new countdown. Escape still respects the configured manual override. Session trigger ownership is retained across settings changes, and stale timer tickets are checked again before preparing the player to prevent delayed entry after movement or exit.
- If you invoke native fullscreen during an automatic session, pointer-based exit is suspended while native fullscreen is active; leaving native fullscreen restores the original outer window.
- Escape/manual window-state exit suspends entry until a return-and-leave cycle. The alternative override setting suspends until a new video URL.
- Pause, end, PiP, navigation away, tab switching, closing the owned tab, and turning the feature off restore owned fullscreen.
- Normal bounds (including negative monitor coordinates) and maximized state are recorded per window. Minimized, popup, and already-fullscreen windows are never taken over. No call requests `focused: true`.
- Sessions and pointer state use `chrome.storage.session` so service-worker suspension does not discard ownership or manual override. A restarted worker conservatively restores saved sessions. Chrome alarms reconcile orphaned sessions; restore failures retain ownership for retry.

### Disabling and recovery

**Turning off Auto Fullscreen using its popup/settings:** restores automatic sessions immediately.

**Disabling/removing the extension in `vivaldi://extensions`:** Chromium stops its service worker. A browser-only extension cannot run a guaranteed cleanup API call after being disabled. The content script removes its player expansion after noticing its invalidated context (normally within two seconds), but the browser window may remain fullscreen. Use **F11** in the affected window to restore the browser UI.

In helper mode, the helper saves native window placement before entry and attempts restoration when the native connection closes, including extension disable/crash. Native placement recovery cannot guarantee that Vivaldi clears its internal fullscreen/UI flag; F11 may still be necessary. Recovery also requires the helper process to remain alive long enough to handle disconnect; force-killing both processes or OS shutdown cannot guarantee cleanup. Desktop focus/taskbar behavior is controlled partly by Vivaldi and Windows and has not been physically verified here.

## Fullscreen research and decision

[`Element.requestFullscreen()` requires transient user activation](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen). Moving away is not a reliable activation gesture. Clicking YouTube's fullscreen button programmatically does not bypass browser restrictions, so automatic native-player fullscreen is intentionally not offered as a misleading strategy.

The [Chrome windows API](https://developer.chrome.com/docs/extensions/reference/api/windows) supports fullscreen window state and explicit IDs. This implementation uses that API and expands the player only as the content part of the real window transition. If the window transition fails, it rolls back the player style. CSS expansion alone is never reported as successful automatic fullscreen.

[Vivaldi documents a browser fullscreen mode](https://help.vivaldi.com/desktop/appearance-customization/full-screen-view/). Vivaldi's UI auto-hide preferences may reveal browser controls at an edge; adjust Appearance settings if you want those hidden. The extension does not change your browser preferences or simulate F11 keystrokes.

[`mouseleave` describes leaving an element](https://developer.mozilla.org/en-US/docs/Web/API/Element/mouseleave_event), not an OS window. The native path uses Microsoft's [`WindowFromPoint`](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-windowfrompoint) and a parent HWND lookup. [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) supplies the local, extension-origin-restricted transport. These constraints are why the optional companion exists.

## Custom notifications and fonts

All toast settings apply without reloading the video: messages, visibility, family, size, weight, text/background color (including alpha in `#RRGGBBAA`), radius, seven positions, duration, and animation. Messages use text nodes, never HTML. Notifications are isolated in a Shadow DOM, ignore pointer events, and honor reduced-motion preferences. They attach to the document fullscreen element when present, otherwise to the fullscreen-window document.

The settings preview keeps the toast visible for editing; actual messages use the configured duration. Inter is bundled and loads locally. For another bundled font:

1. Put its licensed `.woff2` file in `public/fonts/`.
2. Add `{ family: 'My Font', file: 'fonts/my-font.woff2' }` to `bundledFonts` in `src/shared/fonts.ts`.
3. Build/reload the extension and choose that family. The registry supplies both preview and content-script font faces. Include the font's license when distributing it.

## Architecture

```text
src/background/index.ts       Serialized orchestration, tab lifecycle, settings, recovery
src/background/controller.ts  Per-window entering → active → exiting session ownership
src/background/pointer.ts     Native messaging, title binding, connection diagnostics
src/content/index.ts          Page events, player expansion, commands, cleanup
src/content/playback.ts       Video replacement observer and playback eligibility snapshot
src/content/inactivity.ts     Per-page inactivity timer, cancellation, and stale-ticket protection
src/content/toast.ts          Shadow DOM toast rendering and animation
src/shared/                   Types, settings validation, pointer state machine, fonts
src/ui/                       React popup and responsive settings, Tailwind v4 CSS
helper/                       Windows pointer host, installer, protocol tests
tests/                        Eligibility/state machine and window-controller tests
scripts/smoke.mjs             Isolated Chromium extension integration checks and screenshots
public/manifest.json          MV3 manifest, icons, bundled custom font location
dist/                         Load this directory as the unpacked extension
```

Permissions: `storage` for local preferences/ephemeral session recovery; `alarms` for orphan reconciliation; `https://www.youtube.com/*` for the content script and YouTube tab discovery; optional `nativeMessaging` only if selected. There is no broad browsing-history permission. Incognito and embedded/Shorts/music/mobile YouTube pages are outside this version's supported scope.

## Verification

```powershell
npm run check
npm test
npm run build
npx playwright install chromium
node scripts/smoke.mjs
python helper/test_protocol.py
npm audit
```

The integration test uses an isolated temporary browser profile and a routed YouTube-shaped fixture with an actual playing canvas video stream. It does not contact YouTube or modify your normal browser profile. Screenshots go to `artifacts/`. Set `AFS_BROWSER` to an executable path to attempt another Chromium browser; the default uses Playwright Chromium.

See [TESTING.md](TESTING.md) for the exact automated evidence and the physical three-monitor acceptance checklist. Passing mocked or headless tests is not a claim that Vivaldi's taskbar, display scaling, focus preservation, or native helper installation works on every desktop.

## Troubleshooting

- **No tracked YouTube tab:** refresh the page after installing/reloading, use a standard `/watch?v=…` URL, and activate the tab.
- **No activation:** check playback, scroll threshold, text-input focus, PiP, existing fullscreen, active tab, manual override, and helper diagnostics. Move into the page/window and leave again.
- **Helper unavailable:** verify Python works, installation ID matches, project path has not moved, and native messaging permission was granted. Reconnect from Advanced. Managed browsers may disable native messaging.
- **Fullscreen succeeds but layout is wrong:** turn off Auto Fullscreen, note the YouTube layout, and adjust the isolated player selectors in `src/content/index.ts`. YouTube can change its DOM independently of this extension.
- **Browser UI/taskbar still visible:** verify Vivaldi's own F11 fullscreen works on that monitor and inspect its Appearance auto-hide settings. Never treat the player expansion alone as proof of OS fullscreen.
- **Need logs:** enable Debug logging and inspect the extension's service worker from `vivaldi://extensions`. Errors also appear in per-tab eligibility diagnostics when entry fails.

Third-party font and icon licenses are copied into `dist/licenses/` by the build.

### Updating to page inactivity support

The generated `dist/` includes the new behavior. Switch off any current automatic session, reload the extension in `vivaldi://extensions`, and refresh YouTube tabs. Existing preferences are preserved; the new inactivity setting defaults to enabled with a five-second delay. The Windows helper has a small guard update so it can save placement when entry happens with the pointer inside. Reloading the extension restarts the helper from the registered project folder; if you installed a separate copy, update that copy's `host.py` too. No registry changes are needed for an unchanged path/extension ID.
#   V i v a l d i - E x t e n t i o n - A u t o F u l l S c r e e n Y o u t u b e  
 