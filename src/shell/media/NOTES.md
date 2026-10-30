# Music preparation

- Enqueue triggers bounded audio/analysis prefetch. Start awaits the active pair and passes retained windows to the ride.
- Search pauses extraction before sending its request; close/removal abort outstanding work.
- BufferProgress appears after five seconds of a wait, polling actual ready/target audio seconds every 250ms.
- Shared by picker handoff and GameHost startup/rebuffering. Unknown progress is indeterminate; no invented ETA.
- Unmount clears delay/poll timers. DOM tests cover delay, updates, unknown progress and a fresh subsequent wait.
