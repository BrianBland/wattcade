# Cadenza audio resolver

- Separate Node/tsx HTTP service; no new npm runtime dependency. yt-dlp and ffmpeg are
  external executables because extraction/transcoding cannot run in the static site.
- Only individual HTTPS YouTube/SoundCloud track pages; no arbitrary URL proxy, cookies,
  credentials, DRM support or playlist import. Public search uses ytsearch/scsearch.
- API v2 health/search/chunk; WAV windows ≤40 s (90 s timeout), legacy MP3 full-file (180 s).
- Temporary-file cleanup, 64 MB output limit, 30 minute tracks; exact section cuts via ffmpeg.
- Node JS runtime enabled for yt-dlp-ejs; install yt-dlp[default].
- Localhost bind by default; non-loopback requires a token; exact-origin CORS; two jobs max.
- Tests: service.test.ts (mapping, URLs, safe argument passing, cleanup), server.test.ts
  (real localhost HTTP, origin/token controls, health/search/audio/chunk/errors).
- Live YouTube probe blocked by environment outbound proxy. Fixture Chromium smoke passed
  through the real service, MP3 decode, analysis worker, mix planning and playback.
- API v2 browser checks: both providers, WAV/worker playback, chunk boundaries, crossfade, pause, starvation/recovery, eviction; Cadenza road updates.
- Cloudflare Tunnel setup and systemd template: docs/CADENZA_STREAMING.md.
