# Cadenza media server through Cloudflare Tunnel

The optional **Connect → Media server** extension searches YouTube and SoundCloud, including
individual track URLs. A nearby Linux machine runs yt-dlp and ffmpeg. Cloudflare Tunnel gives
that daemon a public HTTPS hostname; the iPad connects to it directly from the hosted app.
No Worker runs the extractor, and no incoming router port or local TLS certificate is needed.

Online queues start after preparing 120 seconds (or the remaining queue, if shorter), matching
the existing recovery threshold. Playback then fills the configured buffer (180 seconds by default,
adjustable from 120 to 240; older 60/90-second preferences move to 120). This lookahead gives Cadenza room
to plan steady efforts and recovery across song changes. Preparation begins when a streamed
track is queued: the first streamed track gets the configured opening buffer before later tracks
get one preview window each. Up to two windows are fetched ahead while
analysis and timeline commits stay in playback order so tempo hints remain consistent.
Completed decoded audio and analysis transfer into the ride,
including the in-flight pipeline when Start is pressed; they are not downloaded or analyzed again.
Picker audio is capped at 128 MiB and released on removal or exit. Windows beyond that budget
retain analysis only and need audio fetching at playback. Starting immediately can still require
the remaining startup windows. Waits longer than five seconds show a progress bar in the picker
and in-game buffering panel, reporting seconds of audio prepared and a percentage, not a guessed ETA.
Playback uses 30-second PCM windows with up to two seconds of analysis context on each
side. Windows are decoded and analyzed in the browser worker, scheduled on the AudioContext
clock, and evicted after playback. Only buffered audio is analyzed; duration is known up front.
Automix uses estimated duration-based crossfades, with no promise of beat or phrase matching.
The plan stays fixed as local BPM/section estimates arrive. Cadenza publishes new road ahead
and preserves ridden geometry and collected blocks. If preparation falls behind, music and
game clocks hold together when analyzed lookahead falls below 90 seconds, then resume at
120 seconds (or the queue end, if closer). Road/city GPU geometry covers only the nearby
140 seconds; lightweight timeline curves and the centreline still scale with queue duration. Local files retain full-analysis behavior.

This is an unofficial extraction integration. Tracks can fail when upstream sites change,
require a login, impose regional restrictions, or block extraction. No account cookies or DRM
support is provided. Use content you have permission to use. Live streams, playlists, and
tracks over 12 hours are excluded. Direct links and searches whose results are all excluded
show the reason (including missing durations or the duration limit), rather than a silent empty list. Window requests have a 90-second extractor timeout,
a 40-second maximum range (including late windows in multi-hour videos), and a 64 MB output limit. Two extraction/search jobs can run at once. The legacy full-file endpoint retains its separate
30-minute/64 MB cap; online playback uses the window endpoint. Range extraction depends on upstream
seeking support; verify the server can supply windows faster than playback before a long ride.

## Steps for your Linux machine

1. Have the repository checked out on Linux. Install **Node 22+**, **Python 3.10+**, **ffmpeg**
   (including ffprobe), and [cloudflared](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/).
   In the repository directory:

   ```sh
   npm ci
   python3 -m venv .venv-media
   .venv-media/bin/python -m pip install -U 'yt-dlp[default]'
   ```

   The yt-dlp default extras supply its JavaScript support; the daemon explicitly enables Node.
   Keep yt-dlp current with the pip command above when source sites change.

2. Generate an app access token and create a private environment file. Replace the origin
   if you use a different hosted app. Save the generated token for the iPad connection screen.

   ```sh
   mkdir -p ~/.config/wattcade
   chmod 700 ~/.config/wattcade
   openssl rand -hex 32
   ```

   Create `~/.config/wattcade/media.env` with these values (substitute your actual absolute
   checkout path and token):

   ```ini
   MEDIA_RESOLVER_HOST=127.0.0.1
   MEDIA_RESOLVER_PORT=8788
   MEDIA_RESOLVER_ORIGIN=https://wattcade.brianb.land
   MEDIA_RESOLVER_TOKEN=PASTE_YOUR_RANDOM_TOKEN
   YT_DLP_BIN=/home/YOUR_USER/wattcade/.venv-media/bin/yt-dlp
   ```

   ```sh
   chmod 600 ~/.config/wattcade/media.env
   set -a
   . ~/.config/wattcade/media.env
   set +a
   npm run media:resolver
   ```

   Keep it running for the first connection test. Bind to loopback: cloudflared runs on the
   same machine and forwards to it. The access token is required even with a loopback bind
   once that address is exposed through a tunnel.

3. In the Cloudflare dashboard, create a **named Cloudflare Tunnel** using the cloudflared
   connector. Use Cloudflare's generated Linux install/run command on this machine. This
   connector token is a separate secret from the app access token above.

4. Add a **published application route** (also called a public hostname):

   | Setting | Value |
   | --- | --- |
   | Hostname | `media.YOUR_DOMAIN` |
   | Service type | HTTP |
   | Service URL | `localhost:8788` |

   Your domain must be managed by Cloudflare for this named-hostname setup. Cloudflare handles
   public HTTPS and DNS. Leave the daemon reachable through its bearer token; a browser-login
   Cloudflare Access policy would intercept cross-origin fetches and require additional integration.
   Use the app's origin in `MEDIA_RESOLVER_ORIGIN` exactly, including its port if any.

5. Open the hosted app on the iPad. On **Connect**, enable **Media server**, enter
   `https://media.YOUR_DOMAIN` and the **app access token**, leave the buffer at 180 seconds,
   and tap **Test connection**. Then launch Cadenza → **Online music**, search YouTube or
   SoundCloud, tap **+** to enqueue songs, and start the ride. The server URL, enabled state,
   buffer preference and access token persist across tabs and browser restarts in the same
   browser on the same app origin. Clear the token field to forget it. Clearing browser site
   data or using a different app URL/browser requires entering the settings again.

6. Once tested, keep both processes running across restarts. Cloudflare's connector install
   command can install its system service. For the app daemon, the included
   `scripts/media-resolver/wattcade-media.service.example` is a **systemd user service** template.
   Replace its checkout path and ensure Node/npm are in its PATH (especially with nvm):

   ```sh
   mkdir -p ~/.config/systemd/user
   cp scripts/media-resolver/wattcade-media.service.example ~/.config/systemd/user/wattcade-media.service
   # Edit WorkingDirectory and PATH in that file before starting it.
   systemctl --user daemon-reload
   systemctl --user enable --now wattcade-media
   journalctl --user -u wattcade-media -f
   ```

   Stop the foreground daemon first to free port 8788. For a user service to run after logout,
   enable lingering for your user (`sudo loginctl enable-linger "$USER"`).

## Cost and limits

A Tunnel connector does not consume Worker CPU time. Extraction/transcoding CPU runs on
Linux; decoding and analysis run on the iPad. No paid Worker is needed for this implementation.
Named Tunnels are available on Cloudflare's free plan; your domain has its own registration cost.
However, Cloudflare's self-serve CDN terms restrict disproportionate audio/video delivery.
Free Tunnel availability is not a guarantee that sustained music traffic is permitted;
check the applicable terms for your intended use. This design can also use another HTTPS
reverse proxy or a private Tailscale HTTPS endpoint without changing the app API.

## Local development

Set `MEDIA_RESOLVER_ORIGIN=http://localhost:5173`, run the daemon and `npm run dev`.
On Connect, use `/media-resolver`, enable the extension and test it. Vite forwards that path
to port 8788. `localhost` on an iPad is the iPad itself; use the HTTPS Tunnel address there.
The standalone `/media-lab.html` uses the same app-wide settings; configure them on Connect first.
Audio still needs a tap or key gesture on iOS; Bluetooth compatibility is independent of Tunnel.

## API, storage and checks

POST `/health` advertises API version 2 and ranged-audio support. POST `/search` takes
`{provider, query}`; POST `/chunk` takes `{url, startS, durationS}` and returns stereo 44.1 kHz WAV.
POST `/playlist` takes `{url, choice?: 'playlist', limit?: 1–100 (MAX_PLAYLIST_ITEMS)}` for a public YouTube playlist and returns
`{playlist, tracks[], skipped[], truncated, limit}` metadata only (no audio download); a watch URL with both `v` and
`list` answers 409 `choice-required` unless `choice: 'playlist'`. `/health` advertises `capabilities.playlists`.
All routes require `Authorization: Bearer TOKEN` when configured and allow only the configured
browser origin. OPTIONS preflights do not require authorization. Responses use `no-store`.
The server accepts only individual HTTPS YouTube/SoundCloud track destinations, runs subprocesses
without a shell, and deletes temporary files after success or failure.

Online metadata and queue order persist, but rolling PCM and window analysis stay in this run's
memory. Reloading requires extraction again. There is no offline online-music cache. The older
full-file `/audio` endpoint remains for full preparation callers; Cadenza online queues use `/chunk`.

Tests cover supported destinations, argument handling, temporary-file cleanup, authentication,
CORS, range limits, overlapping analysis, buffer eviction/retry, transition stability and preservation
of ridden track geometry. Browser checks use fixture audio at the extractor boundary to exercise real
WAV decoding, worker analysis, chunk boundaries, crossfades, starvation/recovery and buffer eviction.
A Cadenza browser check also exercised its renderer and later analysis extending the road. This development environment blocks outbound
YouTube requests (403); live source extraction, actual Cloudflare routing and iPad playback must be
verified on your Linux/iPad setup. Short-window analysis uses local normalization and can differ from
full-song BPM, key and structure; intro/outro classifications in interior windows are treated as verse.

## Startup investigation (October 2026)

Code review found six serial range extractions for the default 180-second startup. Picker
previews previously fetched up to 90 seconds of the first track, discarded decoded audio,
and cancelled any in-flight extraction at Start. Playback then re-fetched those ranges and
ran analysis again even for analysis-seeded windows. A 50-minute source uses bounded ranges,
not a full-file download, but every missing window launches yt-dlp and ffmpeg independently.
The observed three-minute delay has not been reproduced against the live source here.

The regression fixture uses a 3,000-second song: after enqueue-time preparation of six
windows, preparing the ride makes zero loader calls; advancing 30 seconds loads one new
window. Tests also cover transfer during extraction, PCM limits, incomplete seeds, removal,
cancellation, and normal eviction. Live extraction/tunnel/iPad timing remains to be measured.

Parallel fetching uses the resolver's existing two-job limit, both in the picker and during
playback. A freed fetch slot is refilled before analyzing the current window. At most two
windows wait ahead of the one being analyzed; analysis and commits stay ordered. Start
stops scheduling new picker work and drains only already-started windows.
Cancelling ranged requests now aborts server extraction; search briefly retries a busy response
while cancelled jobs release their slots. This server-side cancellation improvement requires
restarting the updated media daemon as well as updating the browser app.

A deterministic latency test (30 seconds per fetch, no CPU/network contention) prepares the
six-window horizon in 90 seconds with two requests versus 180 seconds with one. This is a
scheduler test, not a live YouTube benchmark: shared bandwidth, ffmpeg CPU and browser analysis
can reduce the speedup. Track duration still does not increase the opening window count.

Startup now needs four windows (120 seconds) rather than waiting for all six default windows.
The engine fixture starts at 60 seconds of simulated time, then fills the 180-second rolling
buffer during playback. This keeps the 90-second pause reserve and 120-second recovery
threshold unchanged; an extractor slower than playback can still cause subsequent buffering.

## Per-player timing diagnostics

Edit the player's profile and enable **Debug: media timings** (off by default). The music
picker and game show a collapsible timing table for that music queue. The same in-memory
collector transfers from the picker into the ride; another player/queue gets a fresh one.
Disabling the flag leaves collection, timing clock reads and diagnostic polling off. The
regular buffering progress bar does not require this flag.

Stages: fetch (resolver extraction plus network/body transfer), browser decode, mono downmix,
analysis (worker execution plus queue/message overhead), and analysis/timeline commit. Each
reports call count, average/last/max/total milliseconds, active/peak calls and failures
(including cancelled requests). Totals overlap and must not be added to estimate wall time.
Only fixed-size aggregates are retained; no track URLs/titles or per-window records are stored,
logged or uploaded. The flag persists with the player's settings, including backups.

With simulated 30-second fetches and 10-second analysis, four windows now finish in 80 seconds,
versus 100 seconds when pairs waited for analysis before fetching again. This models scheduling,
not actual iPad or YouTube performance. Use the timing table on the real setup to identify the
next bottleneck before raising resolver concurrency or adding analysis workers.
