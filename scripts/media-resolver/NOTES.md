# Cadenza audio resolver

- Separate Node/tsx HTTP service; no new npm runtime dependency. yt-dlp and ffmpeg are
  external executables because extraction/transcoding cannot run in the static site.
- Only individual HTTPS YouTube/SoundCloud track pages; no arbitrary URL proxy, cookies,
  credentials or DRM support. Playlists only via /playlist (below). Public search uses ytsearch/scsearch.
- API v2 health/search/chunk; WAV windows ≤40 s (90 s timeout), legacy MP3 full-file (180 s).
- Temporary-file cleanup, 64 MB output limit, 12-hour streamed tracks; exact section cuts via ffmpeg.
- Node JS runtime enabled for yt-dlp-ejs; install yt-dlp[default].
- Localhost bind by default; non-loopback requires a token; exact-origin CORS; two jobs max.
- Tests: service.test.ts (mapping, URLs, safe argument passing, cleanup), server.test.ts
  (real localhost HTTP, origin/token controls, health/search/audio/chunk/errors).
- Live YouTube probe blocked by environment outbound proxy. Fixture Chromium smoke passed
  through the real service, MP3 decode, analysis worker, mix planning and playback.
- API v2 browser checks: both providers, WAV/worker playback, chunk boundaries, crossfade, pause, starvation/recovery, eviction; Cadenza road updates.
- Cloudflare Tunnel setup and systemd template: docs/CADENZA_STREAMING.md.
- Search reports rejection reasons for direct links/all-filtered results rather than returning an unexplained empty list.
Streams up to 12 h, ≤40 s windows; range requests do not apply full-source filesize caps. Full MP3 stays ≤30 min/64 MB.
- /playlist (health capabilities.playlists, still api 2): public YouTube playlist metadata only (--flat-playlist,
  no audio), ≤200 items (default 100), order + stable youtube:<id>, skipped[] with reasons (unavailable/duplicate/…),
  truncated flag; watch?v&list → 409 choice-required unless choice:'playlist'; mixes/personal lists rejected;
  client disconnect aborts yt-dlp. Client/MediaPicker/persistence pending (#65/#66).
