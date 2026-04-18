import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkRateLimit } from './_rateLimit';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || 'unknown';
  const result = checkRateLimit(ip);
  res.status(200).json({ ok: true, rateLimit: result });
}
