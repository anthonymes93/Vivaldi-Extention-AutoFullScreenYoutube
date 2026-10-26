// One timer per document. No global cursor sampling and no periodic polling.
// A ticket remains valid only until the next movement, exit, or eligibility change.
export class PageInactivity {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inside = false;
  private suspended = false;
  private ticket: string | null = null;
  constructor(
    private eligible: () => boolean,
    private delay: () => number,
    private activate: (ticket: string) => void,
  ) {}
  private cancel() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.ticket = null;
  }
  move() {
    this.inside = true;
    this.suspended = false;
    this.cancel();
    this.sync();
  }
  leave() {
    this.inside = false;
    this.cancel();
  }
  // After exit/interaction, staying still cannot start another fullscreen session.
  suspend() {
    this.suspended = true;
    this.cancel();
  }
  refresh() {
    this.cancel();
    this.sync();
  }
  sync() {
    if (!this.inside || this.suspended || !this.eligible()) {
      this.cancel();
      return;
    }
    if (this.timer !== undefined || this.ticket !== null) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (!this.inside || this.suspended || !this.eligible()) return;
      this.ticket = crypto.randomUUID();
      this.activate(this.ticket);
    }, this.delay());
  }
  ready(ticket: string) {
    return (
      this.ticket === ticket &&
      this.inside &&
      !this.suspended &&
      this.eligible()
    );
  }
}
