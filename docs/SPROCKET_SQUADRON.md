# Sprocket Squadron

Sprocket Squadron retains its name, `starfighter` ID, and profile/history association.

## Intent

Hold the groove, command the squadron. An bright arcade science-fiction shooter flying across carriers above the clouds powered by endurance riding through a continuous music selection. Automatic movement, aiming, firing, and defensive interception keep hands free. Optional periodic manual dodges are a later experiment. Cadenza remains the interval/steering game.

Music is central; song-by-song preparation should eventually be optional. Reuse the shared picker, mix engine, heard-audio clock, and timeline. Built-in generated soundtracks already work through the picker. Missing analysis produces steady procedural encounters, never invented mandatory rhythm challenges. A separate podcast/no-music mode is deferred.

## Riding-style craft

Craft are actual riding contracts, selected before the music starts. Do not switch trainer modes mid-ride. Show mode, effort, and unlock conditions clearly; auto-launch the remembered available craft after 20 seconds of pedalling.

| Craft | Contract | Combat identity | Availability |
| --- | --- | --- | --- |
| Cadence Cruiser | Rider controls power with virtual gears; 56–75% FTP steady Zone 2. Music changes battle intensity, not the endurance band. No reward for riding above the ceiling. | Continuous pulse fire and growing curved lock-on laser volleys; clean riding charges Nova. | Starter |
| Resonance Escort | ERG around 65% FTP; restrained section changes within Zone 2, maximum about 70%. Grace for target settling; maintain cadence and measured power. | Wingmen and interceptors; a steadier defensive formation. | Unlock after 10 on-target minutes, or convert legacy investment credit |
| Future craft | Cadence-focused, low-cadence endurance, workout-following, or variable-effort contracts. Explicitly opt into their demands. | Distinct weapon/defense mechanics, not permanent damage superiority. | Later |

ERG availability is checked through the shared context before selecting a craft or issuing ERG commands. Disable only the Escort on an unsupported trainer; the Cruiser remains available in SIM mode. The left shifters adjust Cruiser gears; right paddles cycle the priority target left/right. A/Y, the right auxiliary button, or touch activates Nova. D-pad left/right and touch arrows also retarget. Already painted locks stay committed; the next acquisition starts with the chosen target.

## Effort and threat

- Use smoothed measured power and cadence, not individual noisy samples. Startup grace and a few seconds of shortfall tolerance. ERG changes settle gradually; target information reflects the command requested by the game. Shared mixer difficulty/safety remain authoritative.
- On target: guns fire and the ship flies a choreographed route — holds a lane, then glides to the next on a beat, scheduled seconds ahead. Enemy fire is authored against that route, so an on-target ship is never hit: shots graze past or leave a gate it flies through. No reactive dodging, no jitter. Sustained under-target effort reduces firing and makes the pilot sloppy: the ship lags its route and fire is no longer authored to miss, so bullets hit the shield; living enemies ram the ship. Above Zone 2 is also off-contract, but adds no threat pressure: withhold charge/progression and prompt Ease off.
- Hands stay free for targeting, not dodging: right paddles choose which enemies the volleys hit, so the rider influences how much of each formation dies even while invulnerable.
- Recovery is legitimate play. A Nova tap clears ordinary enemies, damages a boss, and grants 20 seconds of escort cover at 50% FTP in ERG (easy spin in SIM). No target penalties, with guns active while pedalling. One button; no holding/repeated tapping. Charge comes from on-target time; ability cannot perpetually recharge itself during cover.
- Hull failure causes a brief protected recovery and rejoin, not game over. Music continues. Gun growth is retained. A music set ending ends the ride cleanly; procedural headless fallback can be endless.
- Default Zone 2 cruiser has no compulsory surges. ERG escort uses announced, bounded section changes. Never use BPM as instantaneous wattage or change resistance per beat.

## Music director

- Sections: intro/verse = cruise formations, build = armored arrivals, drop = swarms and broad volleys, break/outro = lighter encounters and cover. Approximate functional labels, not guaranteed musical form.
- Phrases: change formation/pattern and schedule eligible boss entrances. Beats/onsets: firing rhythm, entrances, impacts, scenery pulses. Keep density bounded, including long dense EDM passages.
- Do not iterate/replay historical events after timeline revisions. Preserve announced targets. The first build freezes a short lookahead announcement locally; richer shared confidence/commit contracts are delegated to #64.
- Cadence challenges are optional bonuses only, roughly a phrase long and spaced minutes apart. Use trustworthy rhythm and a comfortable band; candidate BPM ratios 1, 1/2, 3/4, 2/3. Prefer near 90 RPM within 70–100 RPM, otherwise skip. Never judge exact crank phase from ordinary cadence telemetry. Until local confidence exists, enable only full-analysis timelines with a consistent beat grid.
- First boss eligible at about 2½ minutes, then every 6 minutes; announce 8 seconds ahead, align to a phrase if possible, use bounded timing fallback for nonrhythmic music. Fight 45–90 seconds, then escape and continue if not defeated. Bosses do not raise workout intensity. Three individually lockable batteries protect the main hull. Destroying batteries damages the flagship and exposes its reactor; survivors leave with an escaping flagship. Different silhouettes and attack patterns cycle; music controls their volleys/vulnerability feel.

## Progression

Within a ride: earn combat salvage and upgrade automatically, starting within the first minute. Five gun tiers expand lock capacity from four to eight, visibly unfold weapon pods, and add wingmen. Better weapons genuinely clear enemies faster; do not cancel each upgrade with matching HP scaling. Later bosses/formations create variety and modest escalation independent of music volume. Auto-collect all rewards; no pickup steering or shop interruptions.

Across rides: accumulate on-target minutes and unlock riding-style craft, then new craft/cosmetics later. No new permanent damage purchases. Save v3 preserves old best score separately from the new scoring record, retains the legacy save payload, and converts unspent scrap plus the actual purchase value of upgrades into unlock credit once. The internal ID, achievement IDs, and lifetime counters remain stable. Retune achievement descriptions/conditions where the rebuilt game makes old ones impossible, while preserving earned awards.

## Presentation

Three.js perspective camera with angled forward motion, modeled white/cyan craft with sprocket engine housings, magenta/orange enemy formations, a continuous route from carrier runways above blue clouds through a waterfront city to canyon waterways. Spatial tiles carry tall layered buildings, rooftop antennas, hangars, bridges, rocky cliffs, and outposts; scenery streams beyond the camera with fixed-size instance pools. Destroyable ground batteries and tracked tanks scroll beneath aircraft and independently aim at the player. Curved additive laser trails, yellow locks and selected-target brackets, evasion afterimages, pink/amber projectile glows, ship shadows, rising explosion smoke, larger flagship blasts, bright impact cores, tumbling debris, and brief shockwaves supply combat feedback. Fixed-size instance pools and recycled scenery bound graphics resource use. Different craft silhouettes, wingmen, and weapon tiers must be visible. Music remains clear; avoid punitive audio degradation or repeated loud shooting effects. Restrained beat pulses; no strobe requirement.

HUD: floats over a full-bleed scene in the shared arcade style (main.css tokens, `.card`/`.btn`/`.tag`, neon italic numerals). It shows craft/arsenal, score, ride clear rate, lock pips, effort warnings, boss bar/arrival, shield, song/section, Nova, and big callouts for banners and PERFECT formations. Watts, zone, and controller hints belong to the shell HUD and are not duplicated. All play focus and interactive UI above actual shell insets, portrait and landscape. Touch has previous/next target arrows and the same Nova action and pre-ride craft selection as controller. No implementation terminology in player prompts.

## Lock-on combat slice

Continuous pulse guns support a repeated anticipation/payoff cycle. Holding the riding target paints one lock about every 0.38 seconds, starting with the priority target and spreading to other visible enemies. Extra locks can stack on the priority enemy. Automatic volleys release on a beat/phrase after about 2.4 seconds, with a 3.4-second fallback for sparse analysis. Curved lasers follow committed targets and deliver impact damage after travel time. No trigger tapping or extra wattage is required. Lock ticks ascend quietly and volleys add a restrained whoosh through the shared sound graph/mute setting.

Phrase-driven V formations, staggered arrivals, and sweeping rows enter continuously from well beyond the view ahead or from either flank. Flagships also approach from beyond the horizon, with attached batteries following their hull. Enemies outside the combat area cannot fire or acquire locks. Air formations have up to thirteen fighters, with separate ground groups of tanks and batteries. Moderate, readable density (RayStorm, not bullet hell; roughly 30–80 projectiles on screen): only designated gunners in each formation fire, volleys wait for a beat, and patterns are aimed singles, three-shot fans, short tank bursts, and a 13-shot rotating flagship fan with petals at slow speeds. Each on-target pattern is rotated slightly so it grazes the route, or the connecting shots are dropped to open a gate. Gunners show a closing muzzle-charge ring before firing. In builds and drops, a gunner can fire a 13-shot amber wall on a downbeat with a wide gate where the route will be. Near misses spark, tick quietly, and score. Projectile and enemy budgets remain bounded; steady endurance earns protection without additional wattage. The first flagship provides a concrete target-selection payoff in the opening few minutes; the same experience extends through the full mix.

## Delivery and validation

First playable: both craft, save migration/unlock, automatic combat, musical formations, bosses, Nova/rejoin, run arsenal, Three.js renderer, picker integration, updated arcade card. Tests cover deterministic riding outcomes, idle/under/over/recovery, ERG commands, no required firing input, boss fallback/alignment, uncertain cadence skip, timeline revisions, media end, save migration, and insets. Browser smoke covers portrait/landscape, craft menu/Nova, finite resource use and console errors. Real trainer feel and iPad GPU cost need a physical ride.

Delegated: [music timing/confidence #64](https://github.com/BrianBland/wattcade/issues/64), [selection/management #65](https://github.com/BrianBland/wattcade/issues/65), [playlist import #66](https://github.com/BrianBland/wattcade/issues/66). These should not block the first playable or require a media-core rewrite.
