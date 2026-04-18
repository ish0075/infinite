#!/usr/bin/env node
// ─── THE TRUTH PROTOCOL: RAG Accuracy Auditor ───
// Measures semantic fidelity of the Singularity's retrieval + generation pipeline.
// Usage: OPENAI_API_KEY=sk-... QDRANT_URL=http://localhost:6333 node --experimental-strip-types scripts/audit-rag.ts [--sample N]

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Config ───
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || 'obsidian_vault';
const RETRIEVAL_THRESHOLD = 0.78; // Cosine similarity pass threshold
const JUDGE_MODEL = 'gpt-4o-mini';
const SAMPLE = parseInt(process.argv.find((a) => a.startsWith('--sample'))?.split('=')[1] || '0', 10) || undefined;

// ─── Types ───
interface GroundTruthCase {
  id: string;
  category: string;
  question: string;
  expectedContext: string;
  expectedAnswer: string;
}

interface TestResult {
  id: string;
  category: string;
  question: string;
  retrieval: {
    topChunk: string;
    similarity: number;
    passed: boolean;
  };
  generation: {
    answer: string;
    faithfulness: number;
    relevance: number;
    passed: boolean;
  };
  latencyMs: number;
}

// ─── Utilities ───
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 3) + '...' : str;
}

// ─── Pipeline Functions ───
async function embed(text: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({ input: text, model: 'text-embedding-3-small' }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Embed failed: ${err.error?.message || res.status}`);
  }

  const data = await res.json();
  return data.data[0].embedding;
}

async function searchQdrant(vector: number[], topK = 3): Promise<{ content: string; score: number }[]> {
  const res = await fetch(
    `${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/search`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector,
        limit: topK,
        with_payload: true,
        with_vector: false,
        score_threshold: 0.6,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Qdrant search failed: ${err.status?.error || res.status}`);
  }

  const data = await res.json();
  return data.result.map((point: any) => ({
    content: point.payload?.content || '',
    score: point.score,
  }));
}

async function generateAnswer(question: string, contextChunks: string[]): Promise<string> {
  const context = contextChunks.join('\n\n---\n\n');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are I.N.F.I.N.I.T.E., the intelligence core. Answer based ONLY on the provided context. If the context does not contain the answer, say "Insufficient context." Be concise.',
        },
        {
          role: 'user',
          content: `Context:\n${context}\n\nQuestion: ${question}\n\nAnswer:`,
        },
      ],
      temperature: 0.3,
      max_tokens: 512,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Generation failed: ${err.error?.message || res.status}`);
  }

  const data = await res.json();
  return data.choices[0]?.message?.content || '';
}

async function judgeAnswer(
  question: string,
  expectedAnswer: string,
  actualAnswer: string,
  retrievedContext: string
): Promise<{ faithfulness: number; relevance: number }> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are an objective evaluator. Score the ACTUAL answer against the EXPECTED answer on two metrics:\n\n1. FAITHFULNESS (0-10): Does the actual answer stick to facts in the retrieved context? Deduct for hallucinations or unsupported claims.\n2. RELEVANCE (0-10): Does the actual answer directly address the question? Deduct for tangents or missing key points.\n\nRespond ONLY with valid JSON: {"faithfulness": N, "relevance": N}',
        },
        {
          role: 'user',
          content: `Question: ${question}\n\nExpected Answer: ${expectedAnswer}\n\nActual Answer: ${actualAnswer}\n\nRetrieved Context: ${truncate(retrievedContext, 2000)}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 128,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Judge failed: ${err.error?.message || res.status}`);
  }

  const data = await res.json();
  const parsed = JSON.parse(data.choices[0]?.message?.content || '{}');
  return {
    faithfulness: Math.max(0, Math.min(10, Math.round(parsed.faithfulness ?? 5))),
    relevance: Math.max(0, Math.min(10, Math.round(parsed.relevance ?? 5))),
  };
}

// ─── Main ───
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       THE TRUTH PROTOCOL — RAG FIDELITY AUDITOR              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  if (!OPENAI_KEY) {
    console.error('❌ OPENAI_API_KEY not set. Export it and retry.\n');
    process.exit(1);
  }

  // Load ground truth
  const groundTruthPath = join(__dirname, '..', 'tests', 'ground-truth.json');
  const groundTruth: GroundTruthCase[] = JSON.parse(readFileSync(groundTruthPath, 'utf-8'));
  const cases = SAMPLE ? groundTruth.slice(0, SAMPLE) : groundTruth;

  console.log(`📋 Ground truth cases: ${groundTruth.length} | Running: ${cases.length}\n`);

  const results: TestResult[] = [];

  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i];
    const start = Date.now();
    process.stdout.write(`[${i + 1}/${cases.length}] ${tc.id} (${tc.category}) ... `);

    try {
      // 1. Embed the expected context (ground truth vector)
      const expectedVector = await embed(tc.expectedContext);

      // 2. Embed the question and search Qdrant
      const queryVector = await embed(tc.question);
      const retrieved = await searchQdrant(queryVector, 3);
      const topChunk = retrieved[0]?.content || '';

      // 3. Calculate retrieval similarity (expected vs retrieved)
      const topVector = topChunk ? await embed(topChunk) : new Array(expectedVector.length).fill(0);
      const similarity = cosineSimilarity(expectedVector, topVector);

      // 4. Generate answer from retrieved context
      const answer = await generateAnswer(tc.question, retrieved.map((r) => r.content));

      // 5. Judge the answer
      const { faithfulness, relevance } = await judgeAnswer(
        tc.question,
        tc.expectedAnswer,
        answer,
        retrieved.map((r) => r.content).join('\n\n')
      );

      const latencyMs = Date.now() - start;

      results.push({
        id: tc.id,
        category: tc.category,
        question: tc.question,
        retrieval: {
          topChunk: truncate(topChunk, 120),
          similarity: Math.round(similarity * 1000) / 1000,
          passed: similarity >= RETRIEVAL_THRESHOLD,
        },
        generation: {
          answer: truncate(answer, 200),
          faithfulness,
          relevance,
          passed: faithfulness >= 7 && relevance >= 7,
        },
        latencyMs,
      });

      const rPass = similarity >= RETRIEVAL_THRESHOLD ? '✓' : '✗';
      const gPass = faithfulness >= 7 && relevance >= 7 ? '✓' : '✗';
      console.log(`done. Retrieval ${rPass} (sim=${similarity.toFixed(3)}) | Gen ${gPass} (F=${faithfulness}/10 R=${relevance}/10) | ${latencyMs}ms`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.log(`FAILED: ${message}`);
      results.push({
        id: tc.id,
        category: tc.category,
        question: tc.question,
        retrieval: { topChunk: '', similarity: 0, passed: false },
        generation: { answer: '', faithfulness: 0, relevance: 0, passed: false },
        latencyMs: Date.now() - start,
      });
    }
  }

  // ─── Report ───
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('                    AUDIT REPORT');
  console.log('════════════════════════════════════════════════════════════════\n');

  const retrievalPassed = results.filter((r) => r.retrieval.passed).length;
  const generationPassed = results.filter((r) => r.generation.passed).length;
  const total = results.length;
  const avgLatency = Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / total);
  const avgFaithfulness = Math.round((results.reduce((s, r) => s + r.generation.faithfulness, 0) / total) * 10) / 10;
  const avgRelevance = Math.round((results.reduce((s, r) => s + r.generation.relevance, 0) / total) * 10) / 10;
  const avgSimilarity = Math.round((results.reduce((s, r) => s + r.retrieval.similarity, 0) / total) * 1000) / 1000;

  console.log(`📊 RAG Precision:       ${retrievalPassed}/${total}  (${Math.round((retrievalPassed / total) * 100)}%)`);
  console.log(`🧠 Cognitive Accuracy:  ${generationPassed}/${total}  (${Math.round((generationPassed / total) * 100)}%)`);
  console.log(`📏 Avg Retrieval Sim:   ${avgSimilarity}`);
  console.log(`🎯 Avg Faithfulness:    ${avgFaithfulness}/10`);
  console.log(`🎯 Avg Relevance:       ${avgRelevance}/10`);
  console.log(`⏱️  Avg Latency:         ${avgLatency}ms\n`);

  // Category breakdown
  const categories = new Map<string, { retrieval: number; generation: number; total: number }>();
  for (const r of results) {
    const c = categories.get(r.category) || { retrieval: 0, generation: 0, total: 0 };
    c.total++;
    if (r.retrieval.passed) c.retrieval++;
    if (r.generation.passed) c.generation++;
    categories.set(r.category, c);
  }

  console.log('📁 By Category:');
  for (const [cat, stats] of categories) {
    const rPct = Math.round((stats.retrieval / stats.total) * 100);
    const gPct = Math.round((stats.generation / stats.total) * 100);
    console.log(`   ${cat.padEnd(20)} Retrieval ${rPct}% | Generation ${gPct}% (${stats.total} cases)`);
  }

  console.log('\n────────────────────────────────────────────────────────────────');
  console.log('Detailed results written to: tests/audit-report.json');
  console.log('────────────────────────────────────────────────────────────────\n');

  // Write JSON report
  const report = {
    timestamp: new Date().toISOString(),
    config: {
      retrievalThreshold: RETRIEVAL_THRESHOLD,
      judgeModel: JUDGE_MODEL,
      qdrantCollection: QDRANT_COLLECTION,
      qdrantUrl: QDRANT_URL.replace(/\/\/.*@/, '//***@'), // mask creds
    },
    summary: {
      totalCases: total,
      retrievalPrecision: `${retrievalPassed}/${total}`,
      cognitiveAccuracy: `${generationPassed}/${total}`,
      avgRetrievalSimilarity: avgSimilarity,
      avgFaithfulness,
      avgRelevance,
      avgLatencyMs: avgLatency,
    },
    categoryBreakdown: Object.fromEntries(categories),
    results,
  };

  const reportPath = join(__dirname, '..', 'tests', 'audit-report.json');
  writeFile(reportPath, JSON.stringify(report, null, 2), () => {});
}

import { writeFile } from 'node:fs';
main().catch((err) => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
