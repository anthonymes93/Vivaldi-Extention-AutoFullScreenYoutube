import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { PageInactivity } from "../src/content/inactivity";
describe("page-local inactivity", () => {
  let eligible: boolean,
    delay: number,
    fire: ReturnType<typeof vi.fn<(ticket: string) => void>>,
    idle: PageInactivity;
  beforeEach(() => {
    vi.useFakeTimers();
    eligible = true;
    delay = 5000;
    fire = vi.fn();
    idle = new PageInactivity(
      () => eligible,
      () => delay,
      fire,
    );
  });
  afterEach(() => vi.useRealTimers());
  it("requires observing the pointer inside the page", () => {
    idle.sync();
    vi.advanceTimersByTime(10000);
    expect(fire).not.toHaveBeenCalled();
  });
  it("fires once at five seconds and resets the entire timer on movement", () => {
    idle.move();
    vi.advanceTimersByTime(4000);
    idle.move();
    vi.advanceTimersByTime(4999);
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fire).toHaveBeenCalledTimes(1);
    expect(idle.ready(fire.mock.calls[0][0])).toBe(true);
    idle.sync();
    vi.advanceTimersByTime(20000);
    expect(fire).toHaveBeenCalledTimes(1);
  });
  it("invalidates an activation ticket when the pointer moves or leaves", () => {
    idle.move();
    vi.advanceTimersByTime(5000);
    const first = fire.mock.calls[0][0];
    idle.move();
    expect(idle.ready(first)).toBe(false);
    vi.advanceTimersByTime(5000);
    const second = fire.mock.calls[1][0];
    idle.leave();
    expect(idle.ready(second)).toBe(false);
  });
  it("cancels when the mouse leaves without waiting for inactivity", () => {
    idle.move();
    vi.advanceTimersByTime(4000);
    idle.leave();
    vi.advanceTimersByTime(10000);
    expect(fire).not.toHaveBeenCalled();
  });
  it("cancels when paused, below the scroll threshold, hidden, or otherwise ineligible", () => {
    idle.move();
    vi.advanceTimersByTime(4000);
    eligible = false;
    idle.sync();
    vi.advanceTimersByTime(5000);
    expect(fire).not.toHaveBeenCalled();
    eligible = true;
    idle.sync();
    vi.advanceTimersByTime(4999);
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fire).toHaveBeenCalledTimes(1);
  });
  it("checks eligibility again when the deadline fires", () => {
    idle.move();
    eligible = false;
    vi.advanceTimersByTime(5000);
    expect(fire).not.toHaveBeenCalled();
  });
  it("does not loop after interaction or deactivation until fresh motion", () => {
    idle.move();
    vi.advanceTimersByTime(5000);
    idle.suspend();
    idle.sync();
    vi.advanceTimersByTime(20000);
    expect(fire).toHaveBeenCalledTimes(1);
    idle.move();
    vi.advanceTimersByTime(5000);
    expect(fire).toHaveBeenCalledTimes(2);
  });
  it("applies a configurable delay without using a stale deadline", () => {
    idle.move();
    vi.advanceTimersByTime(4000);
    delay = 10000;
    idle.refresh();
    vi.advanceTimersByTime(9999);
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fire).toHaveBeenCalledTimes(1);
  });
  it("keeps separate pages independent", () => {
    const otherFire = vi.fn();
    const other = new PageInactivity(
      () => true,
      () => 5000,
      otherFire,
    );
    idle.move();
    other.move();
    vi.advanceTimersByTime(4000);
    other.move();
    vi.advanceTimersByTime(1000);
    expect(fire).toHaveBeenCalledTimes(1);
    expect(otherFire).not.toHaveBeenCalled();
  });
});
