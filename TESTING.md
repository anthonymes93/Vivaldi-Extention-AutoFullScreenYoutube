# Verification and desktop acceptance

## Automated evidence

Run date: October 26, 2026. Windows workspace; Node 22.12; Python 3.8.

- TypeScript strict compilation and Vite production build passed.
- 34 Vitest tests cover the existing controller/state safeguards plus page inactivity timing, full reset on movement, stale-ticket rejection, cancellation, independent pages, rearming after interaction, configurable delay, settings migration, and persisted trigger ownership.
- Chromium headless integration passed: actual MV3 worker/content script load; React settings persistence; narrow-screen overflow check; actual `chrome.windows` fullscreen state; trusted pointer exit/return; reading comments/returning to top; pause/resume while outside; Escape override; disabling through settings; SPA URL change; closing an automatic fullscreen tab. Native fullscreen handoff has an additional integration assertion.
- Two Windows helper protocol tests passed: framed handshake/unknown-window response/clean stdin disconnect, and rejection of an oversized message. Python compilation passed.
- Popup and settings screenshots were rendered and visually reviewed. This is separate from validating YouTube's real layout.
- Dependency audit: zero known vulnerabilities at verification time.

Not verified: live YouTube playback/layout, native-host registration through Vivaldi, native HWND binding, physical pointer movement on three monitors, Windows taskbar coverage, mixed-DPI coordinate behavior, native disconnect restoration, and keyboard-focus preservation on the actual desktop. The installed Vivaldi executable did not expose the extension service worker in the isolated headless attempt; that attempt is not reported as a pass. No native-host registry changes were made during development testing.

## Three-monitor acceptance checklist

Page-inactivity update: the build and 34 unit tests passed. Browser checks verified the five-second reset, real fullscreen, movement/return protection, configurable delay, click/wheel exits, and paused/comments safeguards. The final rearm check encountered a headless window-bounds restore error that was classified as a manual exit. Own-session restoration is now excluded from that manual-override classification. Further testing was stopped at the user's request; that final correction has not been rerun through the browser suite.

Use three separate normal Vivaldi windows, one per monitor. Start with maximized windows, then repeat with a normally sized video window. Use the **Windows helper** for the precise-window test. Confirm each YouTube window is bound in diagnostics. Keep a text editor/input open on monitor 2 to check focus remains there.

| Scenario | Expected result | Physical result |
| --- | --- | --- |
| Keep the pointer stationary over a playing video at the top | Real fullscreen after the configured inactivity delay (default five seconds) | Pending |
| Move the mouse before the inactivity deadline | Full countdown restarts; no premature fullscreen | Pending |
| Move within idle-triggered fullscreen, then leave and return | Fullscreen remains active; movement/return does not apply the pointer-exit session policy | Pending |
| Click, scroll, type, or press Escape in idle-triggered fullscreen | Restore without swallowing the interaction; no repeated activation while stationary | Pending |
| Stay still with a paused video or while reading comments | No inactivity activation | Pending |
| Change inactivity delay while a countdown is pending | Wait the full new delay; no stale timer fires | Pending |
| Play at top on monitor 1; move to monitor 2 without clicking | Only monitor 1 enters true fullscreen; video retains aspect ratio; tabs/address bar/taskbar disappear | Pending |
| Type/click on monitor 2, then use monitor 3 | Monitor 1 stays fullscreen; typing continues in the intended application | Pending |
| Return pointer to monitor 1 without clicking | Automatic fullscreen exits promptly; original bounds/state restored | Pending |
| Hover Vivaldi tabs/address bar while staying in its window | Helper mode does not count this as leaving | Pending |
| Read comments below 20 px and leave | No activation | Pending |
| Scroll back to the top while outside, or use script/keyboard to change scroll | No activation until another observed return-and-leave cycle | Pending |
| Pause before leaving | No activation | Pending |
| Pause/end during automatic fullscreen | Original window restored | Pending |
| Resume while pointer remains outside | No activation until the next leave | Pending |
| Focus YouTube search or a comment field and leave | No activation | Pending |
| Enter Picture-in-Picture | No activation; owned fullscreen restored if necessary | Pending |
| Press Escape during automatic fullscreen | Restores; stays suspended until the configured reset condition | Pending |
| Enter YouTube fullscreen manually before leaving | Extension does not take ownership or exit it on return | Pending |
| Use two YouTube windows on different monitors | Each records/restores its own window; activity on the third monitor does not exit either | Pending |
| Use two YouTube tabs in one window | Only the selected/visible tab is eligible; switching away restores an owned session | Pending |
| Navigate to another video through YouTube SPA links | Old session restored, new player observed; a fresh leave is required | Pending |
| Close the fullscreen tab; keep another tab in that window | Original window state restored | Pending |
| Move a YouTube tab between browser windows | Old session restored; newly selected window requires fresh pointer observation/binding | Pending |
| Disable using popup/settings during automatic fullscreen | Immediate restore of automatic sessions | Pending |
| Disable extension in Vivaldi's extension manager with helper connected | Native connection closes; helper attempts placement recovery; page expansion is removed | Pending |
| Disable in extension manager in browser-only mode | Page expansion is removed; window may remain fullscreen; F11 recovery documented | Pending |
| Disconnect/uninstall helper while using helper mode | Restore sessions when possible, show disconnected state, no silent browser fallback | Pending |
| Stop worker from extensions inspector; resume interactions | Conservatively recover stored session, preserve manual override and pointer edges | Pending |
| Repeat on monitors with negative coordinates and mixed scaling | Correct HWND remains targeted; original window placement restored | Pending |
| Move across a window boundary and back rapidly with delay enabled | Pending entry canceled, no repeated toasts or fullscreen loop | Pending |

If any physical test fails, record Vivaldi version, display scaling/layout, window state, detection mode, diagnostics, and exact pointer path. Treat focus stealing or targeting the wrong window as a release-blocking problem for that environment.
