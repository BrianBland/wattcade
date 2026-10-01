// Procedural dungeon generation. Pure; uses only the supplied rng.
export const TILE = { FLOOR: 0, WALL: 1, SWAMP: 2, DOOR: 3 } as const;
export type TileId = 0 | 1 | 2 | 3;

export type EnemyKind = 'chaser' | 'spitter' | 'brute';
export interface SpawnDef { kind: EnemyKind; x: number; y: number }
export interface Room {
  id: number; x0: number; y0: number; w: number; h: number;
  boss: boolean; cleared: boolean; locked: boolean;
  spawns: SpawnDef[];
}
export interface Link { from: number; to: number; points: Array<{ x: number; y: number }> }
export interface World {
  w: number; h: number; tiles: number[];
  rooms: Room[]; links: Link[];
  doorRoom: Record<number, number>; // tile index -> room id that owns the door
  spawn: { x: number; y: number };
}

export const ROOM_W = 19, ROOM_H = 13, PITCH_X = 25, PITCH_Y = 19, MARGIN = 2;
export const GRID = 4;
export const ROOM_COUNT = 13;

const SNAKE: Array<[number, number]> = [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1], [2, 1], [1, 1], [0, 1], [0, 2], [1, 2], [2, 2], [3, 2], [3, 3]];

function walk(rng: () => number): Array<[number, number]> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const path: Array<[number, number]> = [[Math.floor(rng() * GRID), Math.floor(rng() * GRID)]];
    const used = new Set<number>([path[0][0] + path[0][1] * GRID]);
    while (path.length < ROOM_COUNT) {
      const [cx, cy] = path[path.length - 1];
      const opts = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as Array<[number, number]>)
        .map(([dx, dy]) => [cx + dx, cy + dy] as [number, number])
        .filter(([x, y]) => x >= 0 && x < GRID && y >= 0 && y < GRID && !used.has(x + y * GRID));
      if (!opts.length) break;
      const n = opts[Math.floor(rng() * opts.length)];
      path.push(n); used.add(n[0] + n[1] * GRID);
    }
    if (path.length === ROOM_COUNT) return path;
  }
  return SNAKE;
}

export function tileAt(world: World, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) return TILE.WALL;
  return world.tiles[ty * world.w + tx];
}

export function generateWorld(rng: () => number): World {
  const w = MARGIN * 2 + (GRID - 1) * PITCH_X + ROOM_W, h = MARGIN * 2 + (GRID - 1) * PITCH_Y + ROOM_H;
  const tiles = new Array<number>(w * h).fill(TILE.WALL);
  const world: World = { w, h, tiles, rooms: [], links: [], doorRoom: {}, spawn: { x: 0, y: 0 } };
  const cells = walk(rng);
  const set = (x: number, y: number, t: number) => { tiles[y * w + x] = t; };

  cells.forEach(([cx, cy], id) => {
    const room: Room = {
      id, x0: MARGIN + cx * PITCH_X, y0: MARGIN + cy * PITCH_Y, w: ROOM_W, h: ROOM_H,
      boss: id === ROOM_COUNT - 1, cleared: id === 0, locked: false, spawns: [],
    };
    for (let y = room.y0; y < room.y0 + ROOM_H; y++) for (let x = room.x0; x < room.x0 + ROOM_W; x++) set(x, y, TILE.FLOOR);
    // swamp blobs (not in the start room)
    if (id > 0) {
      const blobs = id === ROOM_COUNT - 1 ? 3 : 1 + (rng() < 0.6 ? 1 : 0);
      for (let b = 0; b < blobs; b++) {
        const bx = room.x0 + 4 + rng() * (ROOM_W - 8), by = room.y0 + 3 + rng() * (ROOM_H - 6), br = 2 + rng() * 2;
        for (let y = room.y0; y < room.y0 + ROOM_H; y++) for (let x = room.x0; x < room.x0 + ROOM_W; x++) {
          if (Math.hypot(x + 0.5 - bx, y + 0.5 - by) < br) set(x, y, TILE.SWAMP);
        }
      }
    }
    // enemies
    if (id > 0 && !room.boss) {
      const n = 3 + Math.floor(id / 3);
      for (let i = 0; i < n; i++) {
        const r = rng();
        let kind: EnemyKind = r < 0.5 ? 'chaser' : 'spitter';
        if (id >= 4 && r > 0.8) kind = 'brute';
        if (id === 2 && i === 0) kind = 'spitter';
        room.spawns.push({ kind, x: room.x0 + 3 + rng() * (ROOM_W - 6), y: room.y0 + 2 + rng() * (ROOM_H - 4) });
      }
    }
    world.rooms.push(room);
  });

  for (let i = 0; i + 1 < world.rooms.length; i++) {
    const a = world.rooms[i], b = world.rooms[i + 1];
    const pts: Array<{ x: number; y: number }> = [];
    const horiz = a.y0 === b.y0;
    if (horiz) {
      const dir = b.x0 > a.x0 ? 1 : -1, y = a.y0 + Math.floor(ROOM_H / 2);
      let x = dir > 0 ? a.x0 + ROOM_W : a.x0 - 1;
      const xe = dir > 0 ? b.x0 - 1 : b.x0 + ROOM_W;
      for (; dir > 0 ? x <= xe : x >= xe; x += dir) { set(x, y, TILE.FLOOR); pts.push({ x: x + 0.5, y: y + 0.5 }); }
      const first = pts[0], last = pts[pts.length - 1];
      set(Math.floor(first.x), y, TILE.DOOR); world.doorRoom[y * w + Math.floor(first.x)] = a.id;
      set(Math.floor(last.x), y, TILE.DOOR); world.doorRoom[y * w + Math.floor(last.x)] = b.id;
      pts.unshift({ x: first.x - 2 * dir, y: first.y }); pts.push({ x: last.x + 2 * dir, y: last.y });
    } else {
      const dir = b.y0 > a.y0 ? 1 : -1, x = a.x0 + Math.floor(ROOM_W / 2);
      let y = dir > 0 ? a.y0 + ROOM_H : a.y0 - 1;
      const ye = dir > 0 ? b.y0 - 1 : b.y0 + ROOM_H;
      for (; dir > 0 ? y <= ye : y >= ye; y += dir) { set(x, y, TILE.FLOOR); pts.push({ x: x + 0.5, y: y + 0.5 }); }
      const first = pts[0], last = pts[pts.length - 1];
      set(x, Math.floor(first.y), TILE.DOOR); world.doorRoom[Math.floor(first.y) * w + x] = a.id;
      set(x, Math.floor(last.y), TILE.DOOR); world.doorRoom[Math.floor(last.y) * w + x] = b.id;
      pts.unshift({ x: first.x, y: first.y - 2 * dir }); pts.push({ x: last.x, y: last.y + 2 * dir });
    }
    world.links.push({ from: a.id, to: b.id, points: pts });
  }
  const r0 = world.rooms[0];
  world.spawn = { x: r0.x0 + ROOM_W / 2, y: r0.y0 + ROOM_H / 2 };
  return world;
}
