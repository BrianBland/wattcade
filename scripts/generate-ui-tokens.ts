import { writeFileSync } from 'node:fs';
import { themeCss } from '../src/ui/tokens';
writeFileSync(new URL('../src/ui/tokens.css',import.meta.url),themeCss());
