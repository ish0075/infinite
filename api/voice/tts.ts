// ─── API: Text-to-Speech Proxy (fetch-based) ───

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkRateLimit, getRateLimitHeaders } from '../_rateLimit';

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
  const rateLimit = checkRateLimit(ip);
  Object.entries(getRateLimitHeaders(ip)).forEach(([k, v]) => res.setHeader(k, v));
  if (!rateLimit.allowed) { res.status(429).json({ error: 'Rate limit exceeded' }); return; }

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
