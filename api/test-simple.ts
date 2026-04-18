import type { VercelRequest, VercelResponse } from '@vercel/node';
import { hello } from './_simple';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ hello });
}
