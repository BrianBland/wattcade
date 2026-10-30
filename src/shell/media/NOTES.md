# Music preparation

- Enqueue triggers bounded audio/analysis prefetch. Start stops scheduling and drains the bounded pipeline and passes retained windows to the ride.
- Search pauses extraction before sending its request; close/removal abort outstanding work.
- BufferProgress appears after five seconds of a wait, polling actual ready/target audio seconds every 250ms.
- Shared by picker handoff and GameHost startup/rebuffering. Unknown progress is indeterminate; no invented ETA.
- Unmount clears delay/poll timers. DOM tests cover delay, updates, unknown progress and a fresh subsequent wait.
- Profile “Debug stats” gates collector creation and a collapsible table in picker/game; collector follows the queue into playback. No collector/polling when off.
