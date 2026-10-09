import { resolverServer } from './server';
const host = process.env.MEDIA_RESOLVER_HOST ?? '127.0.0.1';
const token = process.env.MEDIA_RESOLVER_TOKEN;
if (!['127.0.0.1', '::1', 'localhost'].includes(host) && !token) throw new Error('Set MEDIA_RESOLVER_TOKEN before exposing the resolver to the network.');
const port = Number(process.env.MEDIA_RESOLVER_PORT ?? 8788);
resolverServer({ origin: process.env.MEDIA_RESOLVER_ORIGIN ?? 'http://localhost:5173', token }).listen(port, host, () => {
  console.log(`Cadenza audio resolver listening at http://${host}:${port}`);
});
