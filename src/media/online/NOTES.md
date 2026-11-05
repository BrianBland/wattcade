# Media server settings

- URL, enabled state, buffer and access token persist together in browser local storage.
- Legacy session-only tokens migrate on configuration read; persisted empty tokens win.
- Session storage failures cannot reset saved server settings.
- Connection UI reports persistent storage write failures and explains local token storage.
- Regression coverage: browser session end, legacy migration, token clearing, unavailable
  session storage, write failure, and connection form edits followed by remount.

## Streaming startup
- Picker prepares the opening buffer on enqueue; retains up to 128 MiB decoded audio and transfers it with analysis at Start.
- Two fetch-ahead slots plus the window being analyzed; ordered analysis/commits so tempo hints and contiguous coverage stay stable.
- Start/preload request 120s (or queue end); playback fills the configured 120–240s horizon. Pause/resume remain 90/120s.
- Failures preserve committed windows; cancellation discards late results and aborts both outstanding requests.
- Search retries transient 429s while cancelled extraction slots release.
- Tests cover zero duplicate loads, bounds, order, cancellation, retry, simulated latency and engine startup/recovery.
- Timing collector is opt-in per player, fixed-size/run-local; fetch/decode/downmix/analysis/commit durations, counts, failures and peak activity.
