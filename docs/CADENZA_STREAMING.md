# Cadenza media server through Cloudflare Tunnel

The optional **Connect → Media server** extension searches YouTube and SoundCloud, including
individual track URLs. A nearby Linux machine runs yt-dlp and ffmpeg. Cloudflare Tunnel gives
that daemon a public HTTPS hostname; the iPad connects to it directly from the hosted app.
No Worker runs the extractor, and no incoming router port or local TLS certificate is needed.

Online queues start after preparing the configured buffer (60 seconds by default, adjustable
to 180). Playback uses 30-second PCM windows with up to two seconds of analysis context on each
side. Windows are decoded and analyzed in the browser worker, scheduled on the AudioContext
clock, and evicted after playback. Only buffered audio is analyzed; duration is known up front.
Automix uses estimated duration-based crossfades, with no promise of beat or phrase matching.
The plan stays fixed as local BPM/section estimates arrive. Cadenza publishes new road ahead
and preserves ridden geometry and collected blocks. If preparation falls behind, music and
game clocks hold together until the buffer recovers. Local files retain full-analysis behavior.

This is an unofficial extraction integration. Tracks can fail when upstream sites change,
require a login, impose regional restrictions, or block extraction. No account cookies or DRM
support is provided. Use content you have permission to use. Live streams, playlists, and
tracks over 30 minutes are excluded. Direct links and searches whose results are all excluded
show the reason (including missing durations or the duration limit), rather than a silent empty list. Window requests have a 90-second extractor timeout,
a 40-second maximum range, and a 64 MB output limit. Two extraction/search jobs can run at once.

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
   `https://media.YOUR_DOMAIN` and the **app access token**, leave the buffer at 60 seconds,
   and tap **Test connection**. Then launch Cadenza → **Online music**, search YouTube or
   SoundCloud, tap **+** to enqueue songs, and start the ride. If the token is forgotten on a
   new tab, enter it again; server URL, enabled state and buffer preference persist.

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
