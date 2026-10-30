# Seaside — audio (#197)

All of Seaside's sound is made in the browser with Web Audio. It plays no audio files, so **nothing needs a licence or
attribution**. If a cue is later swapped for a Creative Commons track, record the track and its licence in the table at
the bottom and show the credit under the end title.

The mix lives in `src/games/seaside/render/soundMix.ts` (pure and tested). `render/sound.ts` and `render/music.ts` play
it on the shared graph (`src/audio/sfx.ts`, `src/audio/voices.ts`), so the arcade's sound toggle and the ambient ducker
apply. Everything holds while the ride is paused.

## Ambient beds (looping filtered noise, by scene)
| Where | Beds |
|---|---|
| Coast (title, Highway 1, turnout, rollers, pier, the Big One, sunset) | Surf (slow swell), tyres (pitch and level with speed), gravel at the turnout, gulls. The surf thins as the Big One pulls you in. Crickets at sunset. |
| Lou's shop, pier stand | Lou's AM radio: static and a ballpark organ vamp ("same ballgame, same inning"). The surf is muffled indoors. |
| Under | Underwater roar, then the heartbeat. |
| Belly (eyes open → drill) | The gut's muffled churn, the wet heartbeat (faster in the belly), drips, groans. |
| Breakthrough | Bubbles rising, the roar falling away, a gasp of open air. |
| Paddle, beach | Lapping water, paddle strokes in time with your cadence, fire crackle on the beach, birds you don't recognise. |
| Boardwalk → cut stones → monkey mouth | Jungle insects in four species: building along the boardwalk, all four in the cut stones, then dropping out one species at a time in the ruins. |
| Temple | The pool, the hall's air, drips, a low choir pad. |
| Cavern | Torch crackle, drips, wind rising from below. |
| Bridge, magma, fan, toward the gate | Lava hiss, blurps and booms. The hiss fades as the fan cools the eel. |
| The fall | Silence until the Earth starts to grow, then the Earth cue. |
| Re-entry | The roar of fire (with the fire), then wind through the cloud deck. |
| Wings, cliff, angel | Wind (with speed). On the cliff the tyres vanish and Lou's car toots twice as it passes under. Gulls over the morning sea at the end. |

## Bike-reactive sounds
- **Drill:** a saw tone whose pitch and brightness follow your cadence while the bit bores.
- **Fan:** a whoosh whose pitch follows your cadence while the eel cools.
- **Reel:** the ratchet clicks three times a crank turn while the lure drifts. The drag screams with line tension in a fight.
- **Boardwalk:** a plank beat every 1.3 m ridden, so the tempo follows your speed.
- **Wings:** a flap on every downstroke.
- **Moments:** the cast, the lure landing, the bite, the splash, the catch chime, an escape, a purchase, each part snapping on, each drill layer, the final crack.

## Music cues (generated)
Five cues only. Each is a short generative score in `render/musicScore.ts`, and a new cue cross-fades over the last.

| Cue | When | Feel |
|---|---|---|
| `title` | The title, fading over the first 12 s of Highway 1 | D major, easy pluck over warm chords |
| `bigOne` | The Big One, cut dead at the jump | D minor, low pulse under a pad, tightening |
| `island` | The island reveal, the first 80 s of the paddle | A major, open pad and bells |
| `earth` | The fall, from the moment the Earth starts to grow, into re-entry | Slow and wide, with a choir |
| `liftoff` | The angel's climb, through the title, easing at the white | The title's key, with a tune at last |

`npx tsx scripts/seaside-sound-review.ts` renders each cue to a WAV (in `/tmp/seaside-sound`, not committed) and rides a
few scenes with audio on.

## Licences
| Cue | Track | Artist | Licence |
|---|---|---|---|
| All five | Generated in the browser (wattcade) | — | None needed |
