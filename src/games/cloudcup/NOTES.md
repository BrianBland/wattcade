# Scrapjet Rally

Design discussion #293 and playable PR #294. The original cloudcup ID retains arcade history and best finishes.

Three laps against a breaker crew. Select Rookie, Hotshot or Outlaw on the grid. The crew's nominal pace corresponds to 55%, 78% and 102% FTP. A short paddle squeeze trims the line; a hold leans the bike. Speed builds with a lag and carries through pedal release. Cornering load pushes the bike outward, the shoulder costs speed and boost strips reward a clean line.

Follow a rival's exhaust to draft. The point rider contests the tow while two flankers seek striking distance. Their pace adjustment has a bounded range, so they can be dropped. A flanker holds its line and winds up before sweeping. A sweeps left, B sweeps right. Both directions work without a second steering input. A miss puts the chain into recovery. A counter staggers the attacker for 2.4 seconds. A hit overloads the player's jet and requests a temporary 2.5% SIM grade. Two seconds at 110% FTP clears it early; it also clears naturally after seven seconds.

The road mesh, bank forces, camera, scenery and actors sample one closed, arc-length-resampled course. The swing simulation and animated chain use the same tip trajectory. WebGL2 via Three.js draws the race; audio uses Wattcade's shared effects and continuous-voice buses. The panorama, suit paint, track material and original salvage paintings were created with ImageGen. The trackside turbines, car heaps and signal towers use shared geometry and a weathered enamel atlas. Each has a fixed orientation on the course. Run `python scripts/scrapjet-enamel.py` to rebuild the atlas from the three original yard paintings.

Hardware checks still pending: iPad/Bluefy frame pacing, paddle trim, warning readability, trainer overload and sprint recovery.

The PR preview includes /dev/scrapjet.html for an immediate test ride. Arrow keys steer, Z/X sweep and Space simulates a sprint. The footer supports touch. To ride with hardware, use the normal arcade entry.

Each lap forks at the broken viaduct. Mint-painted shoulders trace the left service bridge through the bend and back to the main deck. It works at any pace. The right ramp crosses 24 course units in one second of flight, so the HUD calls for 87 km/h at the lip. Amber folded-steel rails end at the lip. The chevron plates point across a working slag pour to a mint-striped landing. The speed gauge marks launch speed on approach. Touchdown compresses the hover suspension and pays a boost. The later single span narrows to less than half the normal width. Deck geometry, support tests, flight and recovery use the same cross sections for all four bikes. A fall freezes progress for 2.15 seconds, then puts the bike back on supported deck with brief contact protection.

Rivals adjust their class pace by up to 20% in either direction outside a 14-unit gap. Salvage boxes can grant armour or overdrive. When trailing the leader by more than 22 units, a box has a 75% chance of granting six seconds of extra speed from pedaling. Hold C in the test ride to cut simulated power and cadence.
