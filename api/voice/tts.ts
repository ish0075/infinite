// ─── API: TTS Proxy (Self-Contained) ───

import type { VercelRequest, VercelResponse } from '@vercel/node';

// ─── Inlined Rate Limiting ───
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 1000;

function checkRateLimit(ip: string) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true };
  }
  if (entry.count >= RATE_LIMIT) return { allowed: false };
  entry.count++;
  return { allowed: true };
}

function getRateLimitHeaders(ip: string) {
  const entry = rateLimitMap.get(ip);
  const remaining = entry ? Math.max(0, RATE_LIMIT - entry.count) : RATE_LIMIT;
  return { 'X-RateLimit-Limit': String(RATE_LIMIT), 'X-RateLimit-Remaining': String(remaining) };
}

const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY;
const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'bbGtsRRKUfYO634UxSjz';

function getClientIP(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  if (Array.isArray(forwarded)) return forwarded[0];
  return req.socket?.remoteAddress || 'unknown';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const ip = getClientIP(req);
  if (!checkRateLimit(ip).allowed) { res.status(429).json({ error: 'Rate limit exceeded' }); return; }
  Object.entries(getRateLimitHeaders(ip)).forEach(([k, v]) => res.setHeader(k, v));

  if (!ELEVENLABS_KEY) {
    res.status(500).json({ error: 'TTS service not configured' });
    return;
  }

  try {
    const { text, voiceId = DEFAULT_VOICE_ID } = req.body;
    if (!text) { res.status(400).json({ error: 'Text required' }); return; }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'xi-api-key': ELEVENLABS_KEY },
        body: JSON.stringify({
          text,
          model_id: 'eleven_flash_v2_5',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );

    if (!response.ok) throw new Error(`TTS error: ${response.status}`);

    const audioBuffer = await response.arrayBuffer();
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.byteLength);
    res.status(200).send(Buffer.from(audioBuffer));
  } catch (err) {
    console.error('[API /voice/tts]', err);
    res.status(500).json({ error: 'TTS service temporarily unavailable' });
  }
}
