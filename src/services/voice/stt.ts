// ─── Speech-to-Text: Web Speech API wrapper ───

export interface STTCallbacks {
  onResult: (text: string, isFinal: boolean) => void;
  onError: (message: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
}

export function createSTTSession(callbacks: STTCallbacks): any | null {
  const SpeechRecognitionAPI =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognitionAPI) {
    callbacks.onError('Web Speech API not supported in this browser');
    return null;
  }

  const recognition = new SpeechRecognitionAPI();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  recognition.maxAlternatives = 1;

  recognition.onstart = () => callbacks.onStart?.();

  recognition.onresult = (event: any) => {
    const results = event.results;
    const last = results[results.length - 1];
    const transcript = last[0].transcript;
    callbacks.onResult(transcript, last.isFinal);
  };

  recognition.onerror = (event: any) => {
    callbacks.onError(event.error);
  };

  recognition.onend = () => callbacks.onEnd?.();

  return recognition;
}
