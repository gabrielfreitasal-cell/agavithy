import { useState, useRef, useCallback, useEffect } from "react";

export type TranscriptionState = "idle" | "listening" | "processing" | "error";

export interface TranscriptionSegment {
  text: string;
  timestamp: string;
  isFinal: boolean;
}

export interface UseAudioTranscriptionReturn {
  state: TranscriptionState;
  transcript: string;
  interimTranscript: string;
  segments: TranscriptionSegment[];
  error: string | null;
  isSupported: boolean;
  startListening: () => void;
  stopListening: () => void;
  clearTranscript: () => void;
  toggleListening: () => void;
}

// Extend window type for SpeechRecognition
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

export function useAudioTranscription(
  language = "pt-BR"
): UseAudioTranscriptionReturn {
  const [state, setState] = useState<TranscriptionState>("idle");
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [segments, setSegments] = useState<TranscriptionSegment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalTranscriptRef = useRef("");

  const isSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const buildRecognition = useCallback(() => {
    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionAPI();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setState("listening");
      setError(null);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let finalChunk = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;

        if (result.isFinal) {
          finalChunk += text;
          setSegments((prev) => [
            ...prev,
            {
              text,
              timestamp: new Date().toISOString(),
              isFinal: true,
            },
          ]);
        } else {
          interim += text;
        }
      }

      if (finalChunk) {
        finalTranscriptRef.current += (finalTranscriptRef.current ? " " : "") + finalChunk.trim();
        setTranscript(finalTranscriptRef.current);
      }

      setInterimTranscript(interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("[Transcription] Error:", event.error);
      if (event.error === "no-speech") {
        // Não é erro fatal — apenas sem voz detectada
        return;
      }
      setError(`Erro de microfone: ${event.error}`);
      setState("error");
    };

    recognition.onend = () => {
      setInterimTranscript("");
      // Se ainda está em modo listening, reinicia automaticamente
      if (state === "listening") {
        try {
          recognition.start();
        } catch {
          setState("idle");
        }
      } else {
        setState("idle");
      }
    };

    return recognition;
  }, [language, state]);

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError("Seu navegador não suporta transcrição de voz.");
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    finalTranscriptRef.current = transcript; // mantém o texto anterior
    const recognition = buildRecognition();
    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (err) {
      setError("Não foi possível acessar o microfone.");
      setState("error");
    }
  }, [isSupported, buildRecognition, transcript]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null; // previne auto-restart
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setInterimTranscript("");
    setState("idle");
  }, []);

  const toggleListening = useCallback(() => {
    if (state === "listening") {
      stopListening();
    } else {
      startListening();
    }
  }, [state, startListening, stopListening]);

  const clearTranscript = useCallback(() => {
    finalTranscriptRef.current = "";
    setTranscript("");
    setInterimTranscript("");
    setSegments([]);
    setError(null);
  }, []);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      }
    };
  }, []);

  return {
    state,
    transcript,
    interimTranscript,
    segments,
    error,
    isSupported,
    startListening,
    stopListening,
    clearTranscript,
    toggleListening,
  };
}
