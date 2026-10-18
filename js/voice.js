// Speak a task title: the browser's speech recognition, where it exists (Chrome, Android, Safari). Hidden elsewhere.
import { LANG } from './strings.js';

const Rec = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
export const speechSupported = () => !!Rec;

// Calls onText(transcript) once; onEnd() always when listening stops. Returns stop().
export function listen(onText, onEnd, onError) {
  const r = new Rec();
  r.lang = LANG === 'hi' ? 'hi-IN' : 'en-IN';
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.onresult = e => onText(e.results[0][0].transcript);
  r.onerror = e => onError?.(e.error);
  r.onend = onEnd;
  r.start();
  return () => r.stop();
}
