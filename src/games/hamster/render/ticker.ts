interface Headline { id: number; text: string }

/** Pixels per second the headline travels right-to-left across the strip. */
export const TICKER_SPEED = 55;

/**
 * A classic side-scrolling news crawl: each headline enters from the right edge and
 * crawls fully off the left before the next starts. Only the newest pending bulletin
 * is kept; with nothing new, the current one loops.
 */
export class NewsTicker {
  paused = false;
  private current: Headline | null = null;
  private pending: Headline | null = null;
  private seen = -1;
  private x = 0;

  frame(news: Headline, dt: number, width: number, measure: (text: string) => number) {
    width = Math.max(1, width);
    if (!this.current || news.id < this.seen) {
      this.current = { ...news }; this.pending = null; this.x = width;
    } else if (news.id !== this.seen) this.pending = { ...news };
    this.seen = news.id;
    if (!this.paused) {
      this.x -= Math.max(0, dt) * TICKER_SPEED;
      if (this.x < -measure(this.current.text)) {
        if (this.pending) { this.current = this.pending; this.pending = null; }
        this.x = width;
      }
    }
    // After a resize, never leave a headline parked beyond the new right edge.
    if (this.x > width) this.x = width;
    return { text: this.current.text, offset: this.x };
  }
}
