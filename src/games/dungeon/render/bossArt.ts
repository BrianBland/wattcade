import type { ArtDef } from './art';
// Native 32x32 drawings. Shapes write palette characters, never canvas vectors or scaled minions.
const PAL = {
  g: '#58c94c',
  G: '#267744',
  l: '#a4e979',
  e: '#221c2d',
  r: '#ed5b58',
  y: '#f2bf4e',
  Y: '#ad733d',
  b: '#efe2ba',
  B: '#aa987c',
  p: '#734777',
  P: '#3c2d50',
  o: '#c18a4e',
  O: '#815239',
  m: '#87929d',
  M: '#46505f',
  w: '#fff2d0',
  v: '#9a65bd',
  f: '#9de75b'
};
type Boss = 'slime_monarch' | 'bone_lord' | 'ogre_warchief' | 'arch_necromancer';
function draw(name: Boss, attack: boolean, step = 0, hurt = false): string[] {
  const a = Array.from({
    length: 32
  }, () => Array<string>(32).fill('.'));
  const dot = (x: number, y: number, c: string) => {
    if (x >= 0 && y >= 0 && x < 32 && y < 32) a[y][x] = c;
  };
  const rect = (x: number, y: number, w: number, h: number, c: string) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) dot(xx, yy, c);
  };
  const line = (x: number, y: number, xx: number, yy: number, c: string, width = 1) => {
    const n = Math.max(Math.abs(xx - x), Math.abs(yy - y));
    for (let i = 0; i <= n; i++) rect(Math.round(x + (xx - x) * i / (n || 1)), Math.round(y + (yy - y) * i / (n || 1)), width, width, c);
  };
  const oval = (x: number, y: number, rx: number, ry: number, c: string) => {
    for (let yy = -ry; yy <= ry; yy++) {
      const w = Math.floor(rx * Math.sqrt(1 - (yy / ry) ** 2));
      rect(x - w, y + yy, w * 2 + 1, 1, c);
    }
  };
  const poly = (pts: number[][], c: string) => {
    for (let y = 0; y < 32; y++) {
      const xs: number[] = [];
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [ax, ay] = pts[i],
          [bx, by] = pts[j];
        if (ay > y !== by > y) xs.push(ax + (y - ay) * (bx - ax) / (by - ay));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.ceil(xs[i]); x <= xs[i + 1]; x++) dot(x, y, c);
    }
  };
  const skull = (x: number, y: number, small = false) => {
    if (small) {
      rect(x, y, 4, 3, 'b');
      dot(x, y + 1, 'e');
      dot(x + 2, y + 1, 'e');
      rect(x + 1, y + 3, 2, 1, 'B');
    } else {
      rect(x + 1, y, 6, 1, 'b');
      rect(x, y + 1, 8, 5, 'b');
      rect(x + 1, y + 6, 6, 2, 'B');
      rect(x + 1, y + 2, 2, 2, 'e');
      rect(x + 5, y + 2, 2, 2, 'e');
      dot(x + 3, y + 4, 'e');
      rect(x + 2, y + 6, 1, 1, 'w');
      rect(x + 5, y + 6, 1, 1, 'w');
    }
  };
  if (name === 'slime_monarch') {
    const yy = attack ? 24 : 22 + step,
      ry = attack ? 5 : 8;
    oval(16, yy, 12, ry, 'G');
    oval(15, yy - 2, 11, ry - 1, 'g');
    oval(5, yy + 1, 4, 4, 'G');
    oval(4, yy, 3, 3, 'g');
    oval(27, yy, 3, 4, 'G');
    oval(27, yy - 1, 3, 3, 'g');
    line(7, yy - 5, 11, yy - 7, 'l', 2);
    rect(8, yy + 4, 14, 1, 'g');
    const cy = yy - ry - 5;
    poly([[10, cy], [13, cy + 3], [16, cy - 2], [19, cy + 3], [22, cy], [21, cy + 7], [11, cy + 7]], 'y');
    rect(11, cy + 6, 11, 2, 'Y');
    rect(12, cy + 5, 9, 1, 'y');
    rect(16, cy + 3, 2, 2, 'r');
    line(11, yy - 2, 13, yy, 'e');
    line(19, yy, 21, yy - 2, 'e');
    dot(13, yy + 1, hurt ? 'w' : 'e');
    dot(19, yy + 1, hurt ? 'w' : 'e');
    line(22, yy + 2, 25, yy + 4, 'b');
    dot(22, yy + 3, 'b');
    dot(25, yy + 3, 'b');
  } else if (name === 'bone_lord') {
    poly([[9, 9], [22, 9], [26, 26], [21, 25], [18, 29], [15, 26], [9, 29], [6, 27]], 'P');
    poly([[9, 10], [14, 12], [11, 26], [7, 28]], 'p');
    poly([[20, 11], [23, 12], [25, 25], [21, 24]], 'p');
    skull(12, 3);
    line(12, 4, 10, 0, 'b');
    line(19, 4, 21, 0, 'b');
    rect(13, 5, 1, 1, 'r');
    rect(18, 5, 1, 1, 'r');
    rect(15, 12, 3, 10, 'B');
    for (let y = 13; y <= 19; y += 3) {
      line(11, y, 21, y, 'b');
      dot(10, y + 1, 'B');
      dot(22, y + 1, 'B');
    }
    poly([[21, 9], [26, 10], [27, 14], [21, 15], [19, 12]], 'B');
    poly([[21, 9], [25, 10], [26, 12], [21, 13]], 'b');
    line(12, 22, 11 - step, 28, 'B', 2);
    line(20, 22, 21 + step, 28, 'B', 2);
    rect(9 - step, 29, 5, 1, 'b');
    rect(21 + step, 29, 4, 1, 'b');
    const by = attack ? 17 : 20;
    line(5, by - 2, 8, by + 3, 'b', 2);
    line(8, by + 3, 26, by + 3, 'b');
    line(26, by + 3, 29, by - 2, 'b', 2);
    line(6, by - 2, 28, by - 2, 'B');
    line(8, by, 28, by, 'b', 2);
    rect(15, by + 1, 3, 4, 'O');
    line(9, by - 1, 27, by - 1, 'w');
    rect(7, by - 1, 3, 2, 'B');
    rect(22, by - 1, 3, 2, 'B');
  } else if (name === 'ogre_warchief') {
    oval(16, 18, 11, 9, 'O');
    oval(17, 16, 10, 7, 'o');
    oval(17, 8, 7, 6, 'o');
    rect(12, 8, 2, 1, 'r');
    rect(20, 8, 2, 1, 'r');
    rect(14, 12, 7, 2, 'O');
    dot(14, 11, 'w');
    dot(20, 11, 'w');
    oval(5, 19, 3, 7, 'O');
    rect(3, 18, 4, 6, 'o');
    poly([[2, 11], [8, 8], [13, 11], [12, 17], [6, 19], [2, 16]], 'M');
    poly([[3, 11], [8, 10], [11, 12], [10, 15], [5, 16], [3, 14]], 'm');
    dot(5, 12, 'w');
    dot(9, 14, 'w');
    poly([[23, 11], [26, 13], [12, 25], [8, 24]], 'p');
    rect(8, 24, 16, 3, 'P');
    skull(14, 22, true);
    rect(8, 27, 6, 3 + step, 'O');
    rect(20, 27, 6, 3 - step, 'O');
    rect(6, 30, 8, 1, 'O');
    rect(20, 30, 8, 1, 'O');
    if (attack) {
      line(25, 18, 27, 9, 'o', 3);
      line(27, 9, 22, 5, 'O', 2);
      line(22, 4, 22, 15, 'O', 2);
      rect(16, 1, 14, 5, 'M');
      rect(16, 1, 13, 2, 'm');
      rect(17, 5, 13, 1, 'w');
    } else {
      line(27, 18, 28, 24, 'o', 2);
      line(20, 25, 30, 18, 'O', 2);
      poly([[21, 19], [26, 18], [31, 22], [28, 27], [23, 26]], 'M');
      poly([[22, 19], [26, 19], [30, 22], [28, 24], [24, 24]], 'm');
      line(23, 25, 28, 26, 'w');
    }
  } else {
    const yy = step;
    poly([[13, 3 + yy], [20, 4 + yy], [24, 12 + yy], [22, 19 + yy], [25, 27 + yy], [21, 26 + yy], [19, 30], [16, 27 + yy], [12, 30], [9, 27 + yy], [7, 28 + yy], [10, 17 + yy], [7, 12 + yy]], 'P');
    poly([[14, 4 + yy], [18, 5 + yy], [22, 12 + yy], [20, 17 + yy], [23, 26], [18, 25], [15, 29], [12, 26], [10, 27], [12, 16 + yy], [10, 12 + yy]], 'p');
    poly([[15, 5 + yy], [20, 10 + yy], [20, 15 + yy], [12, 15 + yy], [11, 11 + yy]], 'e');
    skull(12, 8 + yy);
    rect(14, 10 + yy, 1, 1, 'f');
    rect(18, 10 + yy, 1, 1, 'f');
    line(12, 18 + yy, 5, 12 + (attack ? -3 : 0), 'b');
    line(5, 12 + (attack ? -3 : 0), 3, 6, 'b');
    line(3, 6, 5, 3, 'b');
    line(21, 18 + yy, 26, 12, 'b');
    line(26, 12, 26, 6, 'b');
    line(26, 6, 24, 3, 'b');
    rect(16, 17 + yy, 2, 3, 'f');
    line(15, 20, 13, 26, 'v');
    line(19, 21, 20, 26, 'v');
    const armY = attack ? 14 : 20;
    line(11, 18, 6, armY, 'p', 3);
    line(21, 18, 25, armY, 'p', 3);
    rect(5, armY, 2, 2, 'b');
    rect(24, armY, 2, 2, 'b');
    line(28, 9, 28, 29, 'O');
    line(28, 9, 31, 6, 'O');
    rect(28, 4, 3, 3, 'g');
    rect(29, 3, 1, 4, 'f');
    dot(30, 1, 'f');
    skull(1, attack ? 15 : 21, true);
    skull(26, attack ? 16 : 23, true);
  }
  return a.map(r => r.join(''));
}
function boss(name: Boss): ArtDef {
  const rows = draw(name, false),
    diff = (r: string[]) => Object.fromEntries(r.map((v, i) => [i, v]).filter(([i, v]) => rows[i as number] !== v));
  return {
    rows,
    pal: PAL,
    frames: {
      walk: [diff(draw(name, false, 0)), diff(draw(name, false, 1))],
      attack: [diff(draw(name, true))],
      hurt: [diff(draw(name, false, 0, true))]
    }
  };
}
export const BOSS_SPRITES: Record<string, ArtDef> = Object.fromEntries((['slime_monarch', 'bone_lord', 'ogre_warchief', 'arch_necromancer'] as Boss[]).map(n => [n, boss(n)]));
