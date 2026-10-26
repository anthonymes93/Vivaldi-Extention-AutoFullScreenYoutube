import { describe, it, expect } from "vitest";
import { ineligible, pointerEdge } from "../src/shared/machine";
import { defaults, normalize } from "../src/shared/settings";
import type { Snapshot, PointerState } from "../src/shared/types";
const good: Snapshot = {
  watch: true,
  playing: true,
  pip: false,
  nativeFullscreen: false,
  scroll: 0,
  editing: false,
  visible: true,
  url: "https://www.youtube.com/watch?v=test",
};
describe("eligibility safeguards", () => {
  it("accepts playing video at the threshold", () =>
    expect(ineligible({ ...good, scroll: 20 }, defaults)).toBeNull());
  it.each([
    { watch: false },
    { playing: false },
    { pip: true },
    { nativeFullscreen: true },
    { scroll: 21 },
    { editing: true },
    { visible: false },
  ])("rejects %j", (patch) =>
    expect(ineligible({ ...good, ...patch }, defaults)).not.toBeNull(),
  );
  it("honors disable", () =>
    expect(ineligible(good, { ...defaults, enabled: false })).not.toBeNull());
});
describe("pointer edges and manual override", () => {
  const initial: PointerState = { inside: false, armed: false, blocked: false };
  it("never activates from an unknown pointer or repeated exits", () => {
    expect(pointerEdge(initial, false).enter).toBe(false);
    const entered = pointerEdge(initial, true);
    const left = pointerEdge(entered.state, false);
    expect(left.enter).toBe(true);
    expect(pointerEdge(left.state, false).enter).toBe(false);
  });
  it("requires a return after manual exit", () => {
    const blocked = { inside: false, armed: false, blocked: true };
    expect(pointerEdge(blocked, false).enter).toBe(false);
    expect(pointerEdge(pointerEdge(blocked, true).state, false).enter).toBe(
      true,
    );
  });
  it("keeps window states independent", () => {
    const a = pointerEdge(pointerEdge(initial, true).state, false).state;
    pointerEdge(initial, true);
    expect(a.inside).toBe(false);
    expect(a.armed).toBe(false);
  });
});
describe("settings validation", () => {
  it("migrates existing settings to a five-second idle delay and bounds new values", () => {
    expect(normalize({ enabled: true }).idleDelay).toBe(5);
    expect(normalize({ enabled: true }).idleEnabled).toBe(true);
    expect(normalize({ idleDelay: -1 }).idleDelay).toBe(1);
    expect(normalize({ idleDelay: 999 }).idleDelay).toBe(300);
    expect(normalize({ idleEnabled: false }).idleEnabled).toBe(false);
  });
  it("merges partial settings and clamps untrusted values", () => {
    const s = normalize({
      threshold: -1,
      delay: 999,
      toast: {
        size: Infinity,
        background: "url(https://bad)",
        enter: "<script>literal</script>",
      },
    });
    expect(s.threshold).toBe(0);
    expect(s.delay).toBe(10);
    expect(s.toast.size).toBe(14);
    expect(s.toast.background).toBe(defaults.toast.background);
    expect(s.toast.enter).toBe("<script>literal</script>");
  });
  it("accepts missing storage", () =>
    expect(normalize(null)).toEqual(defaults));
});
