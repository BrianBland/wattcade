# GameHost renderer loading gate

- Optional GameRenderer.ready() is awaited after mount and inset/resize observation.
- A loading screen with Back covers the host while assets decode and initial poses prepare.
- Trainer remains neutral; simulation, intro auto-start and countdown do not advance while waiting.
- Presses accumulated on the loading screen are discarded with idle(0) before controls appear.
- Rejection shows the existing Back/error UI. Unmount guards prevent a late render or gameplay loop.
- Renderers without ready() keep their existing startup flow after the import/mount completes.
- GameHost tests cover intro/menu waiting, failed loading and leaving during loading.
