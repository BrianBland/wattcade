# GameHost renderer loading gate

## Cosmetic rewards
- C3: Summary → UnlockReveal for already-owned fixed rewards → pending RewardPick, or Arcade. Equipping fixed rewards is optional.
- RewardPick pointer browsing previews; Choose & equip confirms. Controller A confirms the focused choice. Saves are guarded against duplicate activation; errors remain retryable.
- Cosmetic UI styles are scoped to `.cosmetic-ui`; broader Arcade/pause/HUD migration remains separate. ItemArt shows isolated item art, with RiderAvatar for outfit previews.
- Reward interaction tests cover preview ownership, confirmation, defer, duplicate saves, retry and controller equip. Actual desktop/phone captures live in `docs/visual-polish/rewards/README.md`.

- Optional GameRenderer.ready() is awaited after mount and inset/resize observation.
- A loading screen with Back covers the host while assets decode and initial poses prepare.
- Trainer remains neutral; simulation, intro auto-start and countdown do not advance while waiting.
- Presses accumulated on the loading screen are discarded with idle(0) before controls appear.
- Rejection shows the existing Back/error UI. Unmount guards prevent a late render or gameplay loop.
- Renderers without ready() keep their existing startup flow after the import/mount completes.
- GameHost tests cover intro/menu waiting, failed loading and leaving during loading.

- Music buffering keeps the existing error/status text and shows actual ready-audio progress after five seconds.
