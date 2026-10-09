import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { extractAudio, extractRange, search, type Provider } from './service';

interface Options { origin: string; token?: string; search?: typeof search; extractAudio?: typeof extractAudio; extractRange?: typeof extractRange }
const equal = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('Expected JSON.');
  let size = 0; const chunks: Buffer[] = [];
  for await (const chunk of req) { size += chunk.length; if (size > 4096) throw new Error('Request too large.'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString());
}

export function resolverServer(o: Options) {
  let active = 0;
  return createServer(async (req, res) => {
    const json = (status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    res.setHeader('Cache-Control', 'no-store');
    if (req.headers.origin && req.headers.origin !== o.origin) { json(403, { error: 'Origin is not allowed.' }); return; }
    res.setHeader('Access-Control-Allow-Origin', o.origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (o.token && !equal(req.headers.authorization ?? '', `Bearer ${o.token}`)) { json(401, { error: 'Resolver token is invalid.' }); return; }
    if (req.method !== 'POST' || !['/health', '/search', '/audio', '/chunk'].includes(req.url ?? '')) { json(404, { error: 'Endpoint not found.' }); return; }
    if (req.url === '/health') { json(200, { api: 2, name: 'Cadenza media server', capabilities: { search: true, ranges: true }, maxRangeS: 40 }); return; }
    if (active >= 2) { json(429, { error: 'Resolver is busy. Try again shortly.' }); return; }
    active++;
    try {
      const data = await body(req);
      if (req.url === '/search') {
        if (typeof data.query !== 'string' || !['youtube', 'soundcloud'].includes(String(data.provider))) throw new Error('Invalid search.');
        const tracks = await (o.search ?? search)(data.provider as Provider, data.query);
        json(200, { tracks });
      } else {
        if (typeof data.url !== 'string' || data.url.length > 2048) throw new Error('Invalid track URL.');
        const ranged = req.url === '/chunk';
        if (ranged && (typeof data.startS !== 'number' || typeof data.durationS !== 'number')) throw new Error('Invalid audio range.');
        const audio = ranged ? await (o.extractRange ?? extractRange)(data.url, data.startS as number, data.durationS as number) : await (o.extractAudio ?? extractAudio)(data.url);
        res.writeHead(200, { 'Content-Type': ranged ? 'audio/wav' : 'audio/mpeg', 'Content-Length': audio.length }); res.end(audio);
      }
    } catch (e) { if (!res.headersSent) json(400, { error: e instanceof Error ? e.message : 'Resolver failed.' }); }
    finally { active--; }
  });
}
