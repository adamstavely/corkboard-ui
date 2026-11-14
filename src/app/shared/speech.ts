import type { ChatDictationSession } from '@adamstavely/trenchcoat/chat-composer';

/** The browser's speech recognition, where it has one (Chrome and Safari prefix it). */
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionClass = new () => Recognition;
const globals = globalThis as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
const SpeechRecognition = globals.SpeechRecognition ?? globals.webkitSpeechRecognition;

/** Whether this browser can turn speech into text. */
export const canDictate = !!SpeechRecognition;

/**
 * Listens until stopped, calling `heard` with everything said so far. Returns a stop function. Throws where the browser
 * has no speech recognition.
 */
export function listen(heard: (text: string) => void, ended: () => void): () => void {
  if (!SpeechRecognition) throw new Error("This browser can't take dictation");
  const r = new SpeechRecognition();
  r.continuous = true;
  r.interimResults = true;
  r.onresult = (e) => heard(Array.from(e.results, (result) => result[0].transcript).join('').trim());
  r.onend = ended;
  r.onerror = ended;
  r.start();
  return () => r.stop();
}

/** Trench Coat's composer dictation, through the browser's speech recognition. Resolves when listening stops. */
export function dictate(session: ChatDictationSession): Promise<void> {
  return new Promise((resolve, reject) => {
    let stop: () => void;
    try {
      stop = listen(
        (text) => {
          session.onTranscript(text);
          session.onLevel(text ? 0.6 : 0.2);
        },
        () => resolve(),
      );
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    session.signal.addEventListener('abort', () => stop(), { once: true });
  });
}
