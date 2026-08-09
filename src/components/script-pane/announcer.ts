// Debounced live-region announcer (plan Unit 6): speaks the human annotation,
// never code; coalesces bursts (multiple host events in one gesture) into one
// announcement. The role="status" node must already exist in the DOM — the
// shell pre-creates it.

export class Announcer {
  private buffer: string[] = [];
  private timer?: ReturnType<typeof setTimeout>;

  constructor(
    private getNode: () => HTMLElement | null,
    private debounceMs = 800
  ) {}

  announce(text: string) {
    this.buffer.push(text);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.debounceMs);
  }

  // Immediate one-off announcement (e.g., "Restored your script").
  announceNow(text: string) {
    this.buffer = [];
    if (this.timer) clearTimeout(this.timer);
    this.setText(text);
  }

  flush() {
    if (this.buffer.length === 0) return;
    const message =
      this.buffer.length === 1
        ? this.buffer[0]
        : `${this.buffer.length} steps added. Latest: ${this.buffer[this.buffer.length - 1]}`;
    this.buffer = [];
    this.setText(message);
  }

  private setText(text: string) {
    const node = this.getNode();
    if (!node) return;
    // Clear first so repeating the same message re-announces.
    node.textContent = "";
    node.textContent = text;
  }
}
