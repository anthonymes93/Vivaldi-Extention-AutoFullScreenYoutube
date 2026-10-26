import { chromium } from "@playwright/test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const profile = await mkdtemp(path.join(tmpdir(), "afs-smoke-"));
const dist = path.resolve("dist");
const executablePath = process.env.AFS_BROWSER;
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    executablePath,
    channel: executablePath ? undefined : "chromium",
    headless: true,
    timeout: 30000,
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
    viewport: { width: 1280, height: 900 },
  });
  context.setDefaultTimeout(15000);
  const traces=[];context.on('console',m=>{if(m.text().includes('[Auto Fullscreen]'))traces.push(m.text());});
  let worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker", { timeout: 15000 }));
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`chrome-extension://${id}/options.html`);
  await page.getByText("Make room for watching.").waitFor();
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/settings.png", fullPage: true });
  await page
    .getByRole("switch", { name: "Automatic fullscreen", exact: true })
    .click();
  assert.equal(
    await worker.evaluate(
      async () => (await chrome.storage.local.get("settings")).settings.enabled,
    ),
    false,
  );
  await page.reload();
  await page
    .getByRole("switch", { name: "Automatic fullscreen", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("switch", { name: "Automatic fullscreen", exact: true })
      .getAttribute("aria-checked"),
    "false",
  );
  await page
    .getByRole("switch", { name: "Automatic fullscreen", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "artifacts/settings-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.goto(`chrome-extension://${id}/popup.html`);
  await page.getByText("Automatic fullscreen is on").waitFor();
  await page.setViewportSize({ width: 382, height: 620 });
  await page.screenshot({ path: "artifacts/popup.png", fullPage: true });
  // Real extension APIs and content script, deterministic fixture (not live YouTube playback).
  await context.route("https://www.youtube.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><title>AFS test video</title></head><body style="margin:0;height:3000px"><div id="movie_player" style="width:640px;height:360px;background:black"><video muted autoplay></video></div><input aria-label="Search"><script>const v=document.querySelector('video'),c=document.createElement('canvas');c.width=640;c.height=360;const g=c.getContext('2d');setInterval(()=>{g.fillStyle='#222';g.fillRect(0,0,640,360);},100);v.srcObject=c.captureStream(10);v.play();</script></body></html>`,
    }),
  );
  const video = await context.newPage();
  await video.goto("https://www.youtube.com/watch?v=fixture");
  await video.waitForTimeout(500);
  const wid = await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: "https://www.youtube.com/*" });
    return tabs[0].windowId;
  });
  await video.mouse.move(100, 100);
  await video.mouse.move(200, 150);
  // Chrome DevTools dispatch generates trusted movement; leave the viewport.
  await video.mouse.move(-10, 150);
  await video.waitForTimeout(600);
  const state = await worker.evaluate(
    async (wid) => (await chrome.windows.get(wid)).state,
    wid,
  );
  if (state !== "fullscreen")
    console.log(
      "Activation diagnostics:",
      await page.evaluate(() => chrome.runtime.sendMessage({ type: "status" })),
      await video.evaluate(() => ({
        hidden: document.hidden,
        scroll: scrollY,
        video: !!document.querySelector("video"),
        url: location.href,
      })),
    );
  assert.equal(
    state,
    "fullscreen",
    "Pointer exit should enter real browser window fullscreen",
  );
  assert.equal(
    await video.evaluate(() =>
      document.documentElement.classList.contains("afs-fullscreen"),
    ),
    true,
  );
  await video.mouse.move(300, 150);
  await video.waitForTimeout(400);
  assert.notEqual(
    await worker.evaluate(
      async (wid) => (await chrome.windows.get(wid)).state,
      wid,
    ),
    "fullscreen",
  );
  // Returning to the top or resuming while already outside must not activate.
  await video.evaluate(() => window.scrollTo(0, 500));
  await video.waitForTimeout(100);
  await video.mouse.move(-10, 150);
  await video.waitForTimeout(300);
  assert.notEqual(
    await worker.evaluate(
      async (wid) => (await chrome.windows.get(wid)).state,
      wid,
    ),
    "fullscreen",
  );
  await video.evaluate(() => window.scrollTo(0, 0));
  await video.waitForTimeout(150);
  assert.notEqual(
    await worker.evaluate(
      async (wid) => (await chrome.windows.get(wid)).state,
      wid,
    ),
    "fullscreen",
  );
  await video.mouse.move(250, 150);
  await video.evaluate(() => document.querySelector("video").pause());
  await video.waitForTimeout(150);
  await video.mouse.move(-10, 150);
  await video.waitForTimeout(150);
  assert.notEqual(
    await worker.evaluate(
      async (wid) => (await chrome.windows.get(wid)).state,
      wid,
    ),
    "fullscreen",
  );
  await video.evaluate(() => document.querySelector("video").play());
  await video.waitForTimeout(150);
  assert.notEqual(
    await worker.evaluate(
      async (wid) => (await chrome.windows.get(wid)).state,
      wid,
    ),
    "fullscreen",
  );
  const enter = async () => {
    await video.mouse.move(250, 150);
    await video.mouse.move(-10, 150);
    await video.waitForTimeout(250);
    assert.equal(
      await worker.evaluate(
        async (wid) => (await chrome.windows.get(wid)).state,
        wid,
      ),
      "fullscreen",
    );
  };
  await enter();
  await video.keyboard.press("Escape");
  await video.waitForTimeout(250);
  assert.notEqual(
    await worker.evaluate(
      async (wid) => (await chrome.windows.get(wid)).state,
      wid,
    ),
    "fullscreen",
  );
  await video.waitForTimeout(250);
  assert.notEqual(
    await worker.evaluate(
      async (wid) => (await chrome.windows.get(wid)).state,
      wid,
    ),
    "fullscreen",
  );
  await enter();
  await worker.evaluate(async () => {
    const { settings } = await chrome.storage.local.get("settings");
    await chrome.storage.local.set({
      settings: { ...settings, enabled: false },
    });
  });
  await video.waitForTimeout(250);
  assert.notEqual(
    await worker.evaluate(
      async (wid) => (await chrome.windows.get(wid)).state,
      wid,
    ),
    "fullscreen",
  );
  assert.equal(
    await video.evaluate(() =>
      document.documentElement.classList.contains("afs-fullscreen"),
    ),
    false,
  );
  await worker.evaluate(async () => {
    const { settings } = await chrome.storage.local.get("settings");
    await chrome.storage.local.set({
      settings: { ...settings, enabled: true },
    });
  });
  await video.waitForTimeout(150);
  await enter();
  await video.evaluate(() => {
    history.pushState({}, "", "/watch?v=second");
    document.dispatchEvent(new Event("yt-navigate-finish"));
  });
  await video.waitForTimeout(250);
  assert.notEqual(
    await worker.evaluate(
      async (wid) => (await chrome.windows.get(wid)).state,
      wid,
    ),
    "fullscreen",
  );
  await enter();
  // A user gesture can enter native YouTube-style fullscreen during an owned session.
  await video.evaluate(() =>
    document.addEventListener("keydown", (e) => {
      if (e.key === "f")
        void document.querySelector("#movie_player").requestFullscreen();
    }),
  );
  await video.keyboard.press("f");
  await video.waitForTimeout(300);
  assert.equal(await video.evaluate(() => !!document.fullscreenElement), true);
  assert.equal(
    (await page.evaluate(() => chrome.runtime.sendMessage({ type: "status" })))
      .sessions[0].phase,
    "manual",
  );
  await video.mouse.move(250, 150);
  await video.waitForTimeout(200);
  assert.equal(
    await video.evaluate(() => !!document.fullscreenElement),
    true,
    "Pointer return must not exit manual native fullscreen",
  );
  await video.evaluate(() => document.exitFullscreen());
  await video.waitForTimeout(250);
  assert.notEqual(
    await worker.evaluate(
      async (wid) => (await chrome.windows.get(wid)).state,
      wid,
    ),
    "fullscreen",
  );
  await video.mouse.move(-10, 150);
  await enter();
  await video.close();
  await page.waitForTimeout(250);
  assert.notEqual(
    await worker.evaluate(
      async (wid) => (await chrome.windows.get(wid)).state,
      wid,
    ),
    "fullscreen",
  );
  // Idle entry uses the same real window API but has its own return policy.
  const idleVideo = await context.newPage();
  await worker.evaluate(async()=>{const {settings}=await chrome.storage.local.get('settings');await chrome.storage.local.set({settings:{...settings,debug:true}});});
  await idleVideo.goto("https://www.youtube.com/watch?v=idle-fixture");
  await idleVideo.waitForFunction(
    () => document.querySelector("video").readyState >= 2,
  );
  const windowState = () =>
    worker.evaluate(async (wid) => (await chrome.windows.get(wid)).state, wid);
  assert.equal(
    await worker.evaluate(
      async () =>
        (await chrome.storage.local.get("settings")).settings.idleDelay,
    ),
    5,
  );
  await idleVideo.mouse.move(100, 100);
  await idleVideo.waitForTimeout(3000);
  await idleVideo.mouse.move(130, 100);
  await idleVideo.waitForTimeout(2500);
  assert.notEqual(
    await windowState(),
    "fullscreen",
    "Every movement resets the full five-second timer",
  );
  await idleVideo.waitForTimeout(2800);
  assert.equal(
    await windowState(),
    "fullscreen",
    "Stationary page pointer enters real fullscreen",
  );
  assert.equal(
    (await page.evaluate(() => chrome.runtime.sendMessage({ type: "status" })))
      .sessions[0].trigger,
    "idle",
  );
  await idleVideo.mouse.move(300, 150);
  await idleVideo.waitForTimeout(200);
  assert.equal(
    await windowState(),
    "fullscreen",
    "Movement must not exit idle fullscreen",
  );
  await idleVideo.mouse.move(-10, 150);
  await idleVideo.mouse.move(250, 150);
  await idleVideo.waitForTimeout(200);
  assert.equal(
    await windowState(),
    "fullscreen",
    "Leaving and returning must not change idle session ownership",
  );
  await worker.evaluate(async () => {
    const { settings } = await chrome.storage.local.get("settings");
    await chrome.storage.local.set({ settings: { ...settings, idleDelay: 1 } });
  });
  await idleVideo.waitForTimeout(200);
  assert.equal(
    await windowState(),
    "fullscreen",
    "Settings updates must not accidentally apply pointer-return exit to idle sessions",
  );
  await idleVideo.mouse.click(250, 150);
  await idleVideo.waitForTimeout(300);
  assert.notEqual(
    await windowState(),
    "fullscreen",
    "A deliberate click exits idle fullscreen",
  );
  await idleVideo.waitForTimeout(1500);
  assert.notEqual(
    await windowState(),
    "fullscreen",
    "Remaining still after interaction must not loop",
  );
  await idleVideo.evaluate(() => document.querySelector("video").pause());
  await idleVideo.mouse.move(260, 150);
  await idleVideo.waitForTimeout(1400);
  assert.notEqual(
    await windowState(),
    "fullscreen",
    "Paused video cannot activate through inactivity",
  );
  await idleVideo.evaluate(() => {
    window.scrollTo(0, 500);
    void document.querySelector("video").play();
  });
  await idleVideo.mouse.move(280, 150);
  await idleVideo.waitForTimeout(1400);
  assert.notEqual(
    await windowState(),
    "fullscreen",
    "Reading comments cannot activate through inactivity",
  );
  await idleVideo.evaluate(() => window.scrollTo(0, 0));
  await idleVideo.mouse.move(290, 150);
  await idleVideo.waitForTimeout(1400);
  assert.equal(
    await windowState(),
    "fullscreen",
    "Configured one-second delay takes effect",
  );
  await idleVideo.mouse.wheel(0, 100);
  await idleVideo.waitForTimeout(300);
  assert.notEqual(
    await windowState(),
    "fullscreen",
    "Deliberate scrolling exits idle fullscreen",
  );
  await idleVideo.evaluate(() => window.scrollTo(0, 0));
  await idleVideo.mouse.move(310, 150);
  await idleVideo.waitForTimeout(1400);
  if(await windowState() !== 'fullscreen') console.log('Idle rearm diagnostics',traces,JSON.stringify(await page.evaluate(()=>chrome.runtime.sendMessage({type:'status'}))),await idleVideo.evaluate(()=>({scroll:scrollY,focused:document.activeElement?.tagName,paused:document.querySelector('video').paused})));
  assert.equal(await windowState(), "fullscreen");
  await idleVideo.keyboard.press("Escape");
  await idleVideo.waitForTimeout(1500);
  assert.notEqual(
    await windowState(),
    "fullscreen",
    "Escape suspends reactivation",
  );
  await idleVideo.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Existing pointer-exit/fullscreen regression checks, plus five-second page inactivity, movement reset, configurable delay, idle-session movement/return protection, deliberate click/wheel exit, pause/comments safeguards, and no reactivation loop. Screenshots in artifacts/. Live YouTube and physical monitors are not tested.",
  );
} finally {
  await context?.close();
  if (
    path
      .resolve(profile)
      .startsWith(path.resolve(tmpdir()) + path.sep + "afs-smoke-")
  )
    await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
