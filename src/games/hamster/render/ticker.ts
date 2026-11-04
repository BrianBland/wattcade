interface Headline { id: number; text: string }

/** Finish the current joke before taking the newest bulletin; never build a backlog. */
export class NewsTicker {
  paused = false;
  private current: Headline | null = null;
  private pending: Headline | null = null;
  private seen = -1;
  private elapsed = 0;
  private width = 0;

  frame(news: Headline, dt: number, width: number, measure: (text: string) => number) {
    if (!this.current || news.id < this.seen) {
      this.current = { ...news }; this.pending = null; this.elapsed = 0;
    } else if (news.id !== this.seen) this.pending = { ...news };
    this.seen = news.id;
    // A rotation should offer a fresh reading window, not land halfway through a joke.
    if (width !== this.width) { this.width = width; this.elapsed = 0; }
    const travel = () => Math.max(0, measure(this.current!.text) - Math.max(1, width));
    const distance = travel(), duration = Math.max(7, 2.5 + distance / 40 + 3);
    if (!this.paused) {
      this.elapsed += Math.max(0, dt);
      if (this.pending && this.elapsed >= duration) {
        this.current = this.pending; this.pending = null; this.elapsed = 0;
      }
    }
    return { text: this.current.text, offset: 0 - Math.min(travel(), Math.max(0, this.elapsed - 2.5) * 40) };
  }
}
