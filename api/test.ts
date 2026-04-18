import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const key = process.env.OPENAI_API_KEY ? 'present' : 'missing';
  res.status(200).json({ envKey: key, method: req.method });
}
