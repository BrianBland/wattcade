import type { BikeState, GameRenderer, InputState, Profile } from '../../../contracts';
import type { DungeonSnapshot } from '../sim/types';
import { TILE } from '../sim/world';

const TILES_ACROSS = 16; // camera zoom: ~16 tiles across
const MM = 2;            // minimap px per tile
const COLORS = ['#3a3f4b', '#14161c', '#3d5a3a', '#7a5a2a'];

export function createRenderer(): GameRenderer {
  let canvas: HTMLCanvasElement | null = null;
  let g: CanvasRenderingContext2D | null = null;
  let color = '#4cc9f0';
  let mini: HTMLCanvasElement | null = null;
  let miniFor: unknown = null;
  return {
    mount(container: HTMLElement, c: { profile: Readonly<Profile> }) {
      color = c.profile.color;
      canvas = document.createElement('canvas');
      canvas.style.cssText = 'width:100%;height:100%;display:block;background:#0b0c10';
      container.appendChild(canvas);
      g = canvas.getContext('2d');
      this.resize?.(container.clientWidth || 800, container.clientHeight || 600);
    },
    resize(w, h) { if (canvas) { canvas.width = w; canvas.height = h; } },
    render(snapshot: unknown, _bike: Readonly<BikeState>, _input: Readonly<InputState>) {
      const s = snapshot as DungeonSnapshot;
      if (!canvas || !g || !s.world) return;
      const W = canvas.width, H = canvas.height, w = s.world;
      const TS = Math.max(16, Math.round(W / TILES_ACROSS));
      g.fillStyle = '#0b0c10'; g.fillRect(0, 0, W, H);
      const cx = s.player.x * TS - W / 2, cy = s.player.y * TS - H / 2;
      g.save(); g.translate(-cx, -cy);
      const x0 = Math.max(0, Math.floor(cx / TS)), x1 = Math.min(w.w, Math.ceil((cx + W) / TS));
      const y0 = Math.max(0, Math.floor(cy / TS)), y1 = Math.min(w.h, Math.ceil((cy + H) / TS));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const k = w.tiles[y * w.w + x];
        if (k === TILE.WALL) continue;
        let col = COLORS[k];
        if (k === TILE.DOOR) { const rid = w.doorRoom[y * w.w + x]; col = w.rooms[rid].locked ? '#c0392b' : '#7a5a2a'; }
        g.fillStyle = col; g.fillRect(x * TS, y * TS, TS - 1, TS - 1);
      }
      for (const e of s.enemies) {
        g.fillStyle = e.kind === 'boss' ? (e.shielded ? '#6cf' : '#c0a') : e.kind === 'brute' ? '#a33' : e.kind === 'spitter' ? '#da3' : '#e66';
        g.beginPath(); g.arc(e.x * TS, e.y * TS, e.r * TS, 0, Math.PI * 2); g.fill();
        if (e.kind !== 'boss' && e.hp < e.maxHp) { g.fillStyle = '#222'; g.fillRect(e.x * TS - 12, e.y * TS - e.r * TS - 6, 24, 3); g.fillStyle = '#4c4'; g.fillRect(e.x * TS - 12, e.y * TS - e.r * TS - 6, 24 * e.hp / e.maxHp, 3); }
      }
      for (const b of s.bullets) { g.fillStyle = b.friendly ? '#fff' : '#f55'; g.beginPath(); g.arc(b.x * TS, b.y * TS, b.r * TS, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = s.player.invuln ? 0.5 : 1;
      g.fillStyle = color; g.beginPath(); g.arc(s.player.x * TS, s.player.y * TS, s.player.r * TS, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
      // reticle
      const rx = s.player.x * TS + Math.cos(s.aim.angle) * 60, ry = s.player.y * TS + Math.sin(s.aim.angle) * 60;
      g.strokeStyle = s.aim.auto ? '#8f8' : '#fff'; g.lineWidth = 2;
      g.beginPath(); g.arc(rx, ry, 8, 0, Math.PI * 2); g.moveTo(rx - 12, ry); g.lineTo(rx + 12, ry); g.moveTo(rx, ry - 12); g.lineTo(rx, ry + 12); g.stroke();
      g.restore();
      // HUD
      const p = s.player;
      g.fillStyle = '#222'; g.fillRect(16, 16, 200, 14);
      g.fillStyle = p.hp < p.maxHp * 0.4 ? '#e44' : '#4c4'; g.fillRect(16, 16, 200 * Math.max(0, p.hp) / p.maxHp, 14);
      g.fillStyle = '#fff'; g.font = '14px sans-serif';
      g.fillText(`Potions ${p.potions}   Dash ${p.dashCd > 0 ? p.dashCd.toFixed(1) + 's' : 'ready'}`, 16, 48);
      g.fillText(`Rooms ${s.stats.roomsCleared}  Kills ${s.stats.kills}  Deaths ${s.stats.deaths}${p.onSwamp ? '  SWAMP' : ''}`, 16, 66);
      // minimap (top right)
      if (miniFor !== w) {
        miniFor = w; mini = document.createElement('canvas'); mini.width = w.w * MM; mini.height = w.h * MM;
        const m = mini.getContext('2d')!;
        for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
          const k = w.tiles[y * w.w + x]; if (k === TILE.WALL) continue;
          m.fillStyle = k === TILE.SWAMP ? '#3d5a3a' : '#555a66'; m.fillRect(x * MM, y * MM, MM, MM);
        }
      }
      if (mini) {
        const mx0 = W - mini.width - 12, my0 = 12;
        g.globalAlpha = 0.85; g.fillStyle = '#000'; g.fillRect(mx0 - 2, my0 - 2, mini.width + 4, mini.height + 4);
        g.drawImage(mini, mx0, my0);
        for (const r of w.rooms) if (r.cleared && r.id > 0) { g.fillStyle = 'rgba(80,200,120,0.25)'; g.fillRect(mx0 + r.x0 * MM, my0 + r.y0 * MM, r.w * MM, r.h * MM); }
        for (const e of s.enemies) { g.fillStyle = e.kind === 'boss' ? '#c0a' : '#e55'; g.fillRect(mx0 + e.x * MM - 1, my0 + e.y * MM - 1, 3, 3); }
        g.fillStyle = color; g.fillRect(mx0 + p.x * MM - 2, my0 + p.y * MM - 2, 5, 5);
        g.globalAlpha = 1;
      }
      if (s.boss && s.boss.active) {
        g.fillStyle = '#222'; g.fillRect(W / 2 - 200, 16, 400, 16);
        g.fillStyle = s.boss.shielded ? '#6cf' : '#c0a'; g.fillRect(W / 2 - 200, 16, 400 * s.boss.hp / s.boss.maxHp, 16);
        g.fillStyle = '#fff'; g.textAlign = 'center';
        g.fillText(s.boss.shielded ? `SHIELD - SPRINT! (${s.boss.shieldLeftS.toFixed(0)}s)` : `Shield in ${s.boss.nextShieldS.toFixed(0)}s`, W / 2, 50);
        g.textAlign = 'left';
      }
    },
    unmount() { canvas?.remove(); canvas = null; g = null; mini = null; miniFor = null; },
  };
}
