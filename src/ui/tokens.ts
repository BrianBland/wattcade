/** Renderer-safe source of truth. Run `npx tsx scripts/generate-ui-tokens.ts` after edits. */
export const UI = {
  color: {
    background: '#102631',
    surface: '#173542',
    raised: '#214452',
    text: '#fff4dc',
    muted: '#a7bdc6',
    subtle: '#8daeb8',
    accent: '#66e6b8',
    onAccent: '#09242b',
    accentEdge: '#236b5c',
    gold: '#f4cf71',
    danger: '#ff8f98',
    line: '#bdd3da24',
    hover: '#bdd3da0b',
    focus: '#66e6b8',
    disabled: '#647d87'
  },
  font: {
    family: 'system-ui, sans-serif',
    numeric: '"Oxanium", ui-monospace, monospace',
    title: 36,
    heading: 20,
    body: 14,
    small: 12,
    micro: 10
  },
  space: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    section: 32
  },
  size: {
    touch: 44,
    radius: 2,
    focus: 2,
    progress: 4,
    buttonDepth: 3,
    progressStep: 12,
    progressGap: 2
  },
  motion: {
    fast: 120,
    normal: 200
  },
  controller: {
    a: '#2bd96b',
    b: '#ff4d4d',
    y: '#3b82ff',
    z: '#ff9a2b',
    direction: '#a7bdc6'
  },
  zone: ['#8a8aa0', '#3b82ff', '#2de26a', '#ffd23b', '#ff4d4d']
} as const;
export const clamp01 = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
export function themeCss(): string {
  const vars: string[] = [];
  for (const [group, values] of Object.entries(UI)) {
    if (Array.isArray(values)) {
      values.forEach((value, i) => vars.push(`  --ui-${group}-${i + 1}: ${value};`));
      continue;
    }
    for (const [key, value] of Object.entries(values)) vars.push(`  --ui-${group}-${key.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}: ${value}${typeof value === 'number' ? group === 'motion' ? 'ms' : 'px' : ''};`);
  }
  return `/* Generated from tokens.ts; do not edit by hand. */\n:root {\n${vars.join('\n')}\n}\n`;
}
