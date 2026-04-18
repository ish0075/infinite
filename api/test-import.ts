import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkRateLimit } from './utils/rateLimit';

export default function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || 'unknown';
    const result = checkRateLimit(ip);
    res.status(200).json({ ok: true, rateLimit: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
}
