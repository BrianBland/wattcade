# Menu performance
- WarmupStage caps drawing at 60 Hz with FrameGate; simulation/input/mixer cadence is independent.
- Drive-In easing receives accumulated elapsed time between draws; hidden tabs skip drawing.
- ArcadeMenu pauses selected video/fallback art and its avatar when asleep or document-hidden.
- Selected video stays mounted, so waking resumes its playback position.
- Shared avatar drawing caps at 60 Hz and skips hidden tabs; ResizeObserver owns size reads.
- Lobby active sample counts advance incrementally rather than rescanning the recording each HUD tick.
- Toolbar buttons reuse the parent panel blur; card and panel glass remain.
- Tests: frameGate.test.ts covers 60/120/144 Hz and long gaps;
  screens/ArcadeMenu.test.tsx covers sleep/tab-hide pause and wake/resume.

- Remastered uses render-only interpolation between 30 Hz simulation ticks via `VisualSnapshot` and
  `GameLoop.interpolationAlpha`. Distance, road grade and biome weights stay consistent in the displayed
  snapshot; the original simulation snapshot still drives trainer resistance and ride recording.
  Classic draws the original snapshot. Session changes, rewinds and missed ticks reset interpolation.
