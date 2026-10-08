# Drive-In channel update

- Lineup: Live, Comedy, Animals, Surreal, Commercial, Goth, Meme, Lofi Girl, Kittens, Puppies.
- Infinite Slop names come from the Channels menu supplied by the user, not the homepage's category buttons.
- User confirmed Goth's page URL is `https://infiniteslop.ai/?ch=goth`.
- Ads migrates to Commercial; Top/Newest and other retired selections fall back to Live.
- YouTube uses the official IFrame API with native controls, origin and referrer, inline muted autoplay and tap-to-unmute.
- The user-supplied `h-Z0wCdD3dI` is included unchanged and labeled Puppies as requested by the user.
- Kittens uses the previously proposed Explore.org Kitten Rescue video `d1krrgloAzU`; Lofi Girl uses `jfKfPfyJRdk`.
- Player destruction cancels timers and pending API setup to prevent background audio after switching/leaving.
- Autoplay blocking stays interactive; transient errors retry, unavailable embeds skip once.
- YouTube height is at least 200px on supported iPad layouts; HLS retains the existing Safari/iPad limitation.
- Automated checks: Drive-In tests (including mocked YouTube lifecycle), typecheck and build.
- External playlist contents, distinct feeds and current YouTube embed availability could not be checked: network policy blocks direct access. Validate on iPad/Bluefy before merging.
- User testing: Live and Puppies work; all six Slop reruns are identical; Lofi Girl and Kittens are skipped. These failures are unresolved pending actual playlist routing and video/embed availability evidence.
- Follow-up: YouTube readiness gets its full timeout after the API download; skipped streams report a readable reason and log the original error code/video ID.
