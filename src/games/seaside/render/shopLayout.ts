import type { Insets } from '../../../contracts';
import type { Box } from './layout';
export interface ShopLayout { title: Box; tag: Box; receipt: Box; message: Box; bonus: Box; prev: Box; next: Box; buy: Box; leave: Box }
/** Every paper / touch target is inside the rectangular HUD-safe area, including narrow phones. */
export function shopLayout(W: number, H: number, insets: Insets): ShopLayout {
  const x = Math.max(0, insets.left) + 12, right = W - Math.max(0, insets.right) - 12;
  const top = Math.max(0, insets.top) + 12, bottom = H - Math.max(0, insets.bottom) - 12;
  const w = Math.max(0, right - x), gap = 8, buttonH = 44;
  const footer = bottom - buttonH, messageY = footer - 98;
  const tagW = Math.min(300, w * 0.43), receiptW = Math.min(300, w * 0.53);
  const paperY = Math.max(top + 66, Math.min(top + (bottom - top) * 0.43, messageY - 130));
  const paperH = Math.max(0, messageY - paperY - 10);
  const navW = 44, buyW = Math.min(150, Math.max(84, w * 0.26));
  if (w >= 700 && bottom - top < 380) {
    const sideW = Math.min(230, w * 0.26), centreX = x + sideW + 12, centreW = w - sideW * 2 - 24;
    return {
      title: { x: centreX, y: top, w: centreW, h: 52 },
      tag: { x, y: top, w: sideW, h: footer - top - 12 },
      receipt: { x: right - sideW, y: top, w: sideW, h: footer - top - 12 },
      message: { x: centreX, y: top + 68, w: centreW, h: 44 },
      bonus: { x: centreX, y: top + 120, w: centreW, h: 44 },
      prev: { x, y: footer, w: navW, h: buttonH }, next: { x: x + navW + gap, y: footer, w: navW, h: buttonH },
      buy: { x: x + 2 * (navW + gap), y: footer, w: buyW, h: buttonH },
      leave: { x: x + 2 * (navW + gap) + buyW + gap, y: footer, w: w - 2 * (navW + gap) - buyW - gap, h: buttonH },
    };
  }
  return {
    title: { x, y: top, w, h: 52 },
    tag: { x, y: paperY + Math.min(12, paperH * 0.06), w: tagW, h: Math.min(188, paperH - 12) },
    receipt: { x: right - receiptW, y: paperY, w: receiptW, h: paperH },
    message: { x, y: messageY, w, h: 44 }, bonus: { x, y: messageY + 48, w, h: 44 },
    prev: { x, y: footer, w: navW, h: buttonH }, next: { x: x + navW + gap, y: footer, w: navW, h: buttonH },
    buy: { x: x + 2 * (navW + gap), y: footer, w: buyW, h: buttonH },
    leave: { x: x + 2 * (navW + gap) + buyW + gap, y: footer, w: w - 2 * (navW + gap) - buyW - gap, h: buttonH },
  };
}
