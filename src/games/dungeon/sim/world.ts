// Procedural floor generation. Pure; uses only the supplied rng.
// A floor is a branching maze of rooms on a grid (random spanning tree + a few loops),
// so it has dead ends (treasure) and a far-away boss room holding the stairs down.
export const TILE = { FLOOR: 0, WALL: 1, SWAMP: 2, DOOR: 3, STAIRS: 4 } as const;
export type TileId = 0 | 1 | 2 | 3 | 4;

export type EnemyKind = 'chaser' | 'spitter' | 'brute' | 'bat' | 'archer' | 'bomber' | 'summoner';
export interface SpawnDef { kind: EnemyKind; x: number; y: number }
export interface Room {
  id: number; x0: number; y0: number; w: number; h: number;
  boss: boolean; cleared: boolean; locked: boolean; seen: boolean;
  chest: { x: number; y: number; opened: boolean } | null;
  spawns: SpawnDef[];
  depth: number; // room-graph distance from the start room
}
export interface World {
  floor: number;
  w: number; h: number; tiles: number[];
  rooms: Room[];
  adj: number[][];                    // room graph
  doorRoom: Record<number, number>;   // tile index -> room id that owns the door
  spawn: { x: number; y: number };
  stairs: { x: number; y: number };
  theme: number;                      // palette index for the renderer
}

export const CELL_W = 23, CELL_H = 17, MARGIN = 2;
export const GRID_W = 5, GRID_H = 4;

export function tileAt(world: World, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) return TILE.WALL;
  return world.tiles[ty * world.w + tx];
}

/** Enemy kinds unlocked by floor (earlier floors get a gentler mix). */
function pickKind(rng: () => number, floor: number): EnemyKind {
  const pool: EnemyKind[] = ['chaser', 'chaser', 'spitter', 'bat'];
  if (floor >= 1) pool.push('archer');
  if (floor >= 2) pool.push('brute', 'bomber');
  if (floor >= 3) pool.push('summoner', 'archer');
  if (floor >= 5) pool.push('brute', 'bomber');
  return pool[Math.floor(rng() * pool.length)];
}

export function generateWorld(rng: () => number, floor = 1): World {
  const w = MARGIN * 2 + GRID_W * CELL_W, h = MARGIN * 2 + GRID_H * CELL_H;
  const tiles = new Array<number>(w * h).fill(TILE.WALL);
  const set = (x: number, y: number, t: number) => { tiles[y * w + x] = t; };
  const roomCount = Math.min(GRID_W * GRID_H - 2, 9 + floor);

  // --- grow a random spanning tree over grid cells
  const cellOf = new Map<number, number>(); // cell index -> room id
  const cells: Array<[number, number]> = [];
  const edges: Array<[number, number]> = [];
  const start: [number, number] = [Math.floor(rng() * GRID_W), Math.floor(rng() * GRID_H)];
  cells.push(start); cellOf.set(start[0] + start[1] * GRID_W, 0);
  const DIRS: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (cells.length < roomCount) {
    // pick a frontier parent, biased toward recent rooms (long corridors) with some branching
    const pi = rng() < 0.6 ? cells.length - 1 - Math.floor(rng() * Math.min(3, cells.length)) : Math.floor(rng() * cells.length);
    const [px, py] = cells[pi];
    const opts = DIRS.map(([dx, dy]) => [px + dx, py + dy] as [number, number])
      .filter(([x, y]) => x >= 0 && x < GRID_W && y >= 0 && y < GRID_H && !cellOf.has(x + y * GRID_W));
    if (!opts.length) continue;
    const n = opts[Math.floor(rng() * opts.length)];
    cellOf.set(n[0] + n[1] * GRID_W, cells.length);
    edges.push([pi, cells.length]);
    cells.push(n);
  }
  // a couple of loops so it isn't purely a tree
  for (let i = 0; i < cells.length; i++) for (const [dx, dy] of [[1, 0], [0, 1]] as Array<[number, number]>) {
    const j = cellOf.get(cells[i][0] + dx + (cells[i][1] + dy) * GRID_W);
    if (j === undefined || cells[i][0] + dx >= GRID_W) continue;
    if (edges.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) continue;
    if (rng() < 0.12) edges.push([i, j]);
  }
  const adj: number[][] = cells.map(() => []);
  for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); }
  // BFS depth; the deepest room is the boss/stairs room
  const depth = cells.map(() => -1); depth[0] = 0;
  const q = [0];
  while (q.length) { const c = q.shift()!; for (const n of adj[c]) if (depth[n] < 0) { depth[n] = depth[c] + 1; q.push(n); } }
  let bossId = 0;
  for (let i = 1; i < cells.length; i++) if (depth[i] > depth[bossId] || (depth[i] === depth[bossId] && adj[i].length < adj[bossId].length)) bossId = i;

  const world: World = {
    floor, w, h, tiles, rooms: [], adj, doorRoom: {}, spawn: { x: 0, y: 0 }, stairs: { x: 0, y: 0 },
    theme: (floor - 1) % 4,
  };

  cells.forEach(([cx, cy], id) => {
    const boss = id === bossId;
    const rw = boss ? CELL_W - 4 : 9 + 2 * Math.floor(rng() * 5);   // odd widths 9..17
    const rh = boss ? CELL_H - 4 : 7 + 2 * Math.floor(rng() * 4);   // 7..13
    const x0 = MARGIN + cx * CELL_W + 2 + Math.floor(rng() * (CELL_W - 4 - rw + 1));
    const y0 = MARGIN + cy * CELL_H + 2 + Math.floor(rng() * (CELL_H - 4 - rh + 1));
    const deadEnd = id !== 0 && !boss && adj[id].length === 1;
    const room: Room = {
      id, x0, y0, w: rw, h: rh, boss, cleared: id === 0, locked: false, seen: id === 0,
      chest: deadEnd ? { x: x0 + rw / 2, y: y0 + rh / 2, opened: false } : null, spawns: [], depth: depth[id],
    };
    for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) set(x, y, TILE.FLOOR);
    if (id > 0) {
      const blobs = boss ? 2 : rng() < 0.55 ? 1 : 0;
      for (let b = 0; b < blobs; b++) {
        const bx = x0 + 3 + rng() * (rw - 6), by = y0 + 2 + rng() * (rh - 4), br = 1.5 + rng() * 1.5;
        for (let y = y0 + 1; y < y0 + rh - 1; y++) for (let x = x0 + 1; x < x0 + rw - 1; x++) {
          if (Math.hypot(x + 0.5 - bx, y + 0.5 - by) < br) set(x, y, TILE.SWAMP);
        }
      }
    }
    if (id > 0 && !boss) {
      const n = Math.max(2, 1 + Math.round((rw * rh) / 45) + Math.floor(floor / 3) + (deadEnd ? 1 : 0));
      for (let i = 0; i < n; i++) {
        room.spawns.push({ kind: pickKind(rng, floor), x: x0 + 2 + rng() * (rw - 4), y: y0 + 1.5 + rng() * (rh - 3) });
      }
    }
    world.rooms.push(room);
  });

  // --- Z-shaped 1-tile corridors between linked rooms; door tiles where a corridor meets a room
  const roomAt = (x: number, y: number) => world.rooms.find((r) => x >= r.x0 && x < r.x0 + r.w && y >= r.y0 && y < r.y0 + r.h);
  for (const [ai, bi] of edges) {
    const a = world.rooms[ai], b = world.rooms[bi];
    const ax = a.x0 + (a.w >> 1), ay = a.y0 + (a.h >> 1), bx = b.x0 + (b.w >> 1), by = b.y0 + (b.h >> 1);
    const pts: Array<[number, number]> = [];
    const horiz = cells[ai][1] === cells[bi][1];
    if (horiz) {
      const mx = Math.round((Math.max(a.x0, b.x0) + Math.min(a.x0 + a.w, b.x0 + b.w)) / 2);
      for (let x = ax; x !== mx; x += Math.sign(mx - ax)) pts.push([x, ay]);
      for (let y = ay; y !== by; y += Math.sign(by - ay)) pts.push([mx, y]);
      for (let x = mx; x !== bx; x += Math.sign(bx - mx)) pts.push([x, by]);
    } else {
      const my = Math.round((Math.max(a.y0, b.y0) + Math.min(a.y0 + a.h, b.y0 + b.h)) / 2);
      for (let y = ay; y !== my; y += Math.sign(my - ay)) pts.push([ax, y]);
      for (let x = ax; x !== bx; x += Math.sign(bx - ax)) pts.push([x, my]);
      for (let y = my; y !== by; y += Math.sign(by - my)) pts.push([bx, y]);
    }
    pts.push([bx, by]);
    let prev: Room | undefined = a;
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i];
      const r = roomAt(x, y);
      if (r) { prev = r; continue; }
      if (tileAt(world, x, y) === TILE.DOOR) continue;
      const next = i + 1 < pts.length ? roomAt(pts[i + 1][0], pts[i + 1][1]) : undefined;
      if (prev) { set(x, y, TILE.DOOR); world.doorRoom[y * w + x] = prev.id; }
      else if (next) { set(x, y, TILE.DOOR); world.doorRoom[y * w + x] = next.id; }
      else set(x, y, TILE.FLOOR);
      prev = undefined;
    }
  }
  const r0 = world.rooms[0], rb = world.rooms[bossId];
  world.spawn = { x: r0.x0 + r0.w / 2, y: r0.y0 + r0.h / 2 };
  // stairs sit in the boss room's far corner from its centre (away from the boss spawn)
  const sx = rb.x0 + rb.w - 3, sy = rb.y0 + 2;
  set(sx, sy, TILE.STAIRS);
  world.stairs = { x: sx + 0.5, y: sy + 0.5 };
  return world;
}
