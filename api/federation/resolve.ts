import type { VercelRequest, VercelResponse } from '@vercel/node';
import { relay } from '../_lib/federation-gateway';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'GET or POST required' });
  const acct = typeof req.query.acct === 'string' ? req.query.acct : undefined;
  const body = req.method === 'POST' ? req.body : undefined;
  const value = acct || (body && typeof body.acct === 'string' ? body.acct : undefined) || (body && typeof body.actorUrl === 'string' ? body.actorUrl : undefined);
  if (!value || value.length > 512) return res.status(400).json({ error: 'acct or actorUrl is required' });
  const upstreamReq = new Request(`https://vercel.testagram.internal${req.url || '/api/federation/resolve'}`, { method: req.method, headers: req.headers as HeadersInit });
  const response = await relay(upstreamReq, `/webfinger/${encodeURIComponent(value)}`);
  res.status(response.status).setHeader('Content-Type', response.headers.get('content-type') || 'application/json').setHeader('Cache-Control', 'no-store');
  res.send(await response.text());
}
