import { useState, useEffect, useCallback } from 'react';

// Types for SpeechRecognition
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface VoiceInputState {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  finalTranscript: string;
  error: string | null;
  isSupported: boolean;
}

export function useVoiceInput(language: string = 'en-US') {
  const [state, setState] = useState<VoiceInputState>({
    isListening: false,
    transcript: '',
    interimTranscript: '',
    finalTranscript: '',
    error: null,
    isSupported: true,
  });
  const [recognition, setRecognition] = useState<any>(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setState(s => ({ ...s, isSupported: false, error: 'Browser not supported' }));
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = false; // We want one command at a time
    rec.interimResults = true;
    rec.lang = language;

    rec.onstart = () => {
      setState(s => ({
        ...s,
        isListening: true,
        error: null,
        transcript: '',
        interimTranscript: '',
        finalTranscript: ''
      }));
    };

    rec.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setState(s => ({
        ...s,
        interimTranscript: interim,
        finalTranscript: s.finalTranscript + final,
        transcript: s.finalTranscript + final + interim,
      }));
    };

    rec.onerror = (event: any) => {
      // Avoid overwriting a legitimate transcript if user stopped speaking
      if (event.error !== 'no-speech') {
        setState(s => ({ ...s, error: event.error, isListening: false }));
      }
    };

    rec.onend = () => {
      setState(s => ({ ...s, isListening: false }));
    };

    setRecognition(rec);

    return () => {
      // Cleanup if component unmounts while listening
      rec.stop();
    };
  }, [language]);

  const startListening = useCallback(() => {
    if (recognition && !state.isListening) {
      try {
        recognition.start();
      } catch (e) {
        console.error('Failed to start recognition', e);
      }
    }
  }, [recognition, state.isListening]);

  const stopListening = useCallback(() => {
    if (recognition && state.isListening) {
      recognition.stop();
    }
  }, [recognition, state.isListening]);

  return { ...state, startListening, stopListening };
}
