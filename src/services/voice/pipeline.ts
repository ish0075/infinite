import { speak } from './tts';
import { createSTTSession } from './stt';
import { queryLLM } from '../llm/router';
import { queryRAG, buildAugmentedPrompt } from '../rag/qdrant';
import type { LLMMessage } from '../llm/types';
import type { VoicePipelineEvent, VoicePipelineState } from './types';

// ─── The Speech-to-Thought Pipeline ───
// STT → RAG → LLM → TTS
// All in one async generator for real-time streaming

export async function* runVoicePipeline(
  initialTranscript: string
): AsyncGenerator<VoicePipelineEvent, void, unknown> {
  yield { type: 'thinking' };

  try {
    // 1. RAG: Retrieve relevant context
    const ragResult = await queryRAG({ text: initialTranscript, topK: 5 });

    // 2. Build augmented prompt
    const augmented = buildAugmentedPrompt(initialTranscript, ragResult);

    // 3. LLM: Generate response
    const messages: LLMMessage[] = [
      { role: 'system', content: augmented.systemPrompt },
      { role: 'user', content: augmented.userPrompt },
    ];

    const response = await queryLLM({ messages, temperature: 0.7 });

    yield { type: 'response', text: response.text };

    // 4. TTS: Speak the response
    yield { type: 'speaking', audioUrl: '' };
    await speak(response.text, () => {
      // TTS complete
    });

    yield { type: 'idle' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown pipeline error';
    yield { type: 'error', message };
  }
}

// ─── Hook for React integration ───
export function useVoicePipeline() {
  let recognition: any | null = null;
  let isRunning = false;

  const start = async (
    onEvent: (event: VoicePipelineEvent) => void,
    onStateChange: (state: VoicePipelineState) => void
  ) => {
    if (isRunning) return;
    isRunning = true;

    onStateChange({
      isListening: true,
      isProcessing: false,
      isSpeaking: false,
      transcript: '',
      error: null,
    });

    recognition = createSTTSession({
      onStart: () => {
        onStateChange({
          isListening: true,
          isProcessing: false,
          isSpeaking: false,
          transcript: '',
          error: null,
        });
      },
      onResult: (text, isFinal) => {
        onStateChange({
          isListening: !isFinal,
          isProcessing: false,
          isSpeaking: false,
          transcript: text,
          error: null,
        });

        if (isFinal) {
          onStateChange({
            isListening: false,
            isProcessing: true,
            isSpeaking: false,
            transcript: text,
            error: null,
          });

          // Run the full pipeline
          (async () => {
            for await (const event of runVoicePipeline(text)) {
              onEvent(event);
              if (event.type === 'speaking') {
                onStateChange({
                  isListening: false,
                  isProcessing: false,
                  isSpeaking: true,
                  transcript: text,
                  error: null,
                });
              }
              if (event.type === 'idle' || event.type === 'error') {
                onStateChange({
                  isListening: false,
                  isProcessing: false,
                  isSpeaking: false,
                  transcript: text,
                  error: event.type === 'error' ? (event as any).message : null,
                });
                isRunning = false;
              }
            }
          })();
        }
      },
      onError: (message) => {
        onStateChange({
          isListening: false,
          isProcessing: false,
          isSpeaking: false,
          transcript: '',
          error: message,
        });
        isRunning = false;
      },
      onEnd: () => {
        if (isRunning) {
          // Auto-restart if still running (continuous listening)
          recognition?.start();
        }
      },
    });

    recognition?.start();
  };

  const stop = () => {
    isRunning = false;
    recognition?.stop();
    recognition = null;
  };

  return { start, stop };
}
