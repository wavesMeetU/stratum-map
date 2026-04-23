/**
 * Coalesces many chunk arrivals into one `requestAnimationFrame` callback
 * to avoid main-thread storms and redundant encodes.
 */
export class IncrementalDrawScheduler {
  private handle = 0;

  constructor(private readonly draw: () => void) {}

  request(): void {
    if (this.handle !== 0) return;
    this.handle = requestAnimationFrame(() => {
      this.handle = 0;
      this.draw();
    });
  }

  cancel(): void {
    if (this.handle !== 0) {
      cancelAnimationFrame(this.handle);
      this.handle = 0;
    }
  }
}
