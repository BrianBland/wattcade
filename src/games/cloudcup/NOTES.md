# Scrapjet Rally

Design discussion #293 and playable PR #294. The internal cloudcup ID preserves arcade history and best finishes from the first prototype.

Magnet Mile is a three-lap salvage-yard race. Hold a paddle to steer, release to keep your line. Choose Rookie, Hotshot or Outlaw on the grid. Their nominal rival pace matches 55%, 78% and 102% of rider FTP before pilot variation, items and boosts.

Gold strips give three seconds of boost. A goo drum arms one lob. Press A with a rival ahead to launch it. The blob arcs for 0.8 seconds before halving the target's pace for four seconds. Rival spills mark a patch of road 65 game units ahead. Hitting a spill costs speed and adds a temporary grade through the resistance mixer. Two seconds at 110% FTP purge the goo early. Otherwise it wears off after eight seconds. The threshold, duration and grade are tunable.

The deterministic sim owns projectile timing and recovery. Canvas layers a painted panorama, a projected grit-textured road, distinct rider sprites and world-space splat effects. The environment and character paintings were created with ImageGen. The road, pickup art, shadows and animation are procedural. A physical ride is still needed to tune steering and recovery effort.
