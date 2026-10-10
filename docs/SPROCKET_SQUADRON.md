# Sprocket Squadron

Rebuild of Sprocket Squadron, retaining the original Sprocket pun. A possible musical name for later discussion is Sprocket Symphony. Keep the `starfighter` ID and existing profile/history association. The working title can change without another migration.

## Intent

Hold the groove, command the squadron. An angled overhead space shooter powered by endurance riding through a continuous music selection. Automatic movement, aiming, firing, and defensive interception keep hands free. Optional periodic manual dodges are a later experiment. Cadenza remains the interval/steering game.

Music is central; song-by-song preparation should eventually be optional. Reuse the shared picker, mix engine, heard-audio clock, and timeline. Built-in generated soundtracks already work through the picker. Missing analysis produces steady procedural encounters, never invented mandatory rhythm challenges. A separate podcast/no-music mode is deferred.

## Riding-style craft

Craft are actual riding contracts, selected before the music starts. Do not switch trainer modes mid-ride. Show mode, effort, and unlock conditions clearly; auto-launch the remembered available craft after 20 seconds of pedalling.

| Craft | Contract | Combat identity | Availability |
| --- | --- | --- | --- |
| Cadence Cruiser | Rider controls power with virtual gears; 56–75% FTP steady Zone 2. Music changes battle intensity, not the endurance band. No reward for riding above the ceiling. | Fast pulse volleys / spread guns; clean riding charges Nova. | Starter |
| Resonance Escort | ERG around 65% FTP; restrained section changes within Zone 2, maximum about 70%. Grace for target settling; maintain cadence and measured power. | Wingmen and interceptors; a steadier defensive formation. | Unlock after 10 on-target minutes, or convert legacy investment credit |
| Future craft | Cadence-focused, low-cadence endurance, workout-following, or variable-effort contracts. Explicitly opt into their demands. | Distinct weapon/defense mechanics, not permanent damage superiority. | Later |

ERG availability is checked through the shared context before selecting a craft or issuing ERG commands. Disable only the Escort on an unsupported trainer; the Cruiser remains available in SIM mode. The left shifters adjust Cruiser gears; right up activates Nova.

## Effort and threat

- Use smoothed measured power and cadence, not individual noisy samples. Startup grace and a few seconds of shortfall tolerance. ERG changes settle gradually; target information reflects the command requested by the game. Shared mixer difficulty/safety remain authoritative.
- On target: guns fire, the ship auto-maneuvers, and defense intercepts enemy bullets. Sustained under-target effort reduces firing and interception progressively; living enemies ram the ship. Above Zone 2 is also off-contract, but adds no threat pressure: withhold charge/progression and prompt Ease off.
- Recovery is legitimate play. A Nova tap clears ordinary enemies, damages a boss, and grants 20 seconds of escort cover at 50% FTP in ERG (easy spin in SIM). No target penalties, with guns active while pedalling. One button; no holding/repeated tapping. Charge comes from on-target time; ability cannot perpetually recharge itself during cover.
- Hull failure causes a brief protected recovery and rejoin, not game over. Music continues. Gun growth is retained. A music set ending ends the ride cleanly; procedural headless fallback can be endless.
- Default Zone 2 cruiser has no compulsory surges. ERG escort uses announced, bounded section changes. Never use BPM as instantaneous wattage or change resistance per beat.

## Music director

- Sections: intro/verse = cruise formations, build = armored arrivals, drop = swarms and broad volleys, break/outro = lighter encounters and cover. Approximate functional labels, not guaranteed musical form.
- Phrases: change formation/pattern and schedule eligible boss entrances. Beats/onsets: firing rhythm, entrances, impacts, scenery pulses. Keep density bounded, including long dense EDM passages.
- Do not iterate/replay historical events after timeline revisions. Preserve announced targets. The first build freezes a short lookahead announcement locally; richer shared confidence/commit contracts are delegated to #64.
- Cadence challenges are optional bonuses only, roughly a phrase long and spaced minutes apart. Use trustworthy rhythm and a comfortable band; candidate BPM ratios 1, 1/2, 3/4, 2/3. Prefer near 90 RPM within 70–100 RPM, otherwise skip. Never judge exact crank phase from ordinary cadence telemetry. Until local confidence exists, enable only full-analysis timelines with a consistent beat grid.
- Boss eligible every 6 minutes; announce 8 seconds ahead, align to a phrase if possible, use bounded timing fallback for nonrhythmic music. Fight 45–90 seconds, then escape and continue if not defeated. Bosses do not raise workout intensity. Different silhouettes and attack patterns cycle; music controls their volleys/vulnerability feel.

## Progression

Within a ride: earn combat salvage and upgrade automatically, starting within the first minute. Five gun tiers, then missiles and wingmen. Better weapons genuinely clear enemies faster; do not cancel each upgrade with matching HP scaling. Later bosses/formations create variety and modest escalation independent of music volume. Auto-collect all rewards; no pickup steering or shop interruptions.

Across rides: accumulate on-target minutes and unlock riding-style craft, then new craft/cosmetics later. No new permanent damage purchases. Save v3 preserves old best score separately from the new scoring record, retains the legacy save payload, and converts unspent scrap plus the actual purchase value of upgrades into unlock credit once. The internal ID, achievement IDs, and lifetime counters remain stable. Retune achievement descriptions/conditions where the rebuilt game makes old ones impossible, while preserving earned awards.

## Presentation

Rebuild with Three.js: orthographic angled overhead camera, modeled hulls/canopies/weapon pods, luminous shots, intercept shields, trails, deep starfield, nebula backdrop, large readable bosses. Different craft silhouettes, wingmen, and weapon tiers must be visible. Music remains clear; avoid punitive audio degradation or repeated loud shooting effects. Restrained beat pulses; no strobe requirement.

HUD: current craft, target watts/band, actual effort status, Nova charge, hull/shield, song/section, boss bar/arrival, upgrade milestones. All play focus and interactive UI above actual shell insets, portrait and landscape. Touch has the same single Nova action and pre-ride craft selection as controller. No implementation terminology in player prompts.

## Delivery and validation

First playable: both craft, save migration/unlock, automatic combat, musical formations, bosses, Nova/rejoin, run arsenal, Three.js renderer, picker integration, updated arcade card. Tests cover deterministic riding outcomes, idle/under/over/recovery, ERG commands, no required firing input, boss fallback/alignment, uncertain cadence skip, timeline revisions, media end, save migration, and insets. Browser smoke covers portrait/landscape, craft menu/Nova, finite resource use and console errors. Real trainer feel and iPad GPU cost need a physical ride.

Delegated: [music timing/confidence #64](https://github.com/BrianBland/wattcade/issues/64), [selection/management #65](https://github.com/BrianBland/wattcade/issues/65), [playlist import #66](https://github.com/BrianBland/wattcade/issues/66). These should not block the first playable or require a media-core rewrite.
