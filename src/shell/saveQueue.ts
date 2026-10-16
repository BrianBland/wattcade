import type { GameSaveSchema } from '../contracts';

interface Checkpoint { profileId: string; gameId: string; data: unknown; schema?: GameSaveSchema }

/** Detached checkpoints, serialized writes, and retained failures. New checkpoints replace older pending ones per game. */
export class GameSaveQueue {
  private pending = new Map<string, Checkpoint>();
  private running: Promise<void> | undefined;
  constructor(private write: (p: string, g: string, data: unknown, schema?: GameSaveSchema) => Promise<void>, private onError: (error: unknown) => void) {}

  enqueue(profileId: string, gameId: string, data: unknown, schema?: GameSaveSchema): void {
    this.pending.set(JSON.stringify([profileId, gameId]), { profileId, gameId, data: structuredClone(data), schema });
    if (!this.running) void this.flush().catch(this.onError);
  }

  flush(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.drain().then(() => {
      this.running = undefined;
      return this.pending.size ? this.flush() : undefined;
    }, (error) => { this.running = undefined; throw error; });
    return this.running;
  }

  discard(profileId: string): void {
    for (const [key, c] of this.pending) if (c.profileId === profileId) this.pending.delete(key);
  }

  private async drain(): Promise<void> {
    while (this.pending.size) {
      const [key, checkpoint] = this.pending.entries().next().value!;
      await this.write(checkpoint.profileId, checkpoint.gameId, checkpoint.data, checkpoint.schema);
      // A newer checkpoint may have arrived during the write. Keep it until it too is committed.
      if (this.pending.get(key) === checkpoint) this.pending.delete(key);
    }
  }
}
