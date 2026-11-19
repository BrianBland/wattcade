# Scrapjet Rally

Design discussion #293 and playable PR #294. The original cloudcup ID retains arcade history and best finishes.

Three laps against a breaker crew. Select Rookie, Hotshot or Outlaw on the grid. The crew's nominal pace corresponds to 55%, 78% and 102% FTP. A short paddle squeeze trims the line; a hold leans the bike. Speed builds with a lag and carries through pedal release. Cornering load pushes the bike outward, the shoulder costs speed and boost strips reward a clean line.

Follow a rival's exhaust to draft. The point rider contests the tow while two flankers seek striking distance. Their pace adjustment has a bounded range, so they can be dropped. A flanker holds its line and winds up before sweeping. A sweeps left, B sweeps right. Both directions work without a second steering input. A miss puts the chain into recovery. A counter staggers the attacker for 2.4 seconds. A hit overloads the player's jet and requests a temporary 2.5% SIM grade. Two seconds at 110% FTP clears it early; it also clears naturally after seven seconds.

The road mesh, bank forces, camera, scenery and actors sample one closed, arc-length-resampled course. The swing simulation and animated chain use the same tip trajectory. WebGL2 via Three.js draws the race; audio uses Wattcade's shared effects and continuous-voice buses. The panorama, suit paint, track material and salvage paintings were created with ImageGen. The bikes, trusses, animated crusher drums and lighting are geometry.

Hardware checks still pending: iPad/Bluefy frame pacing, paddle trim, warning readability, trainer overload and sprint recovery.

The PR preview includes /dev/scrapjet.html for an immediate test ride. Arrow keys steer, Z/X sweep and Space simulates a sprint. The footer supports touch. To ride with hardware, use the normal arcade entry.
