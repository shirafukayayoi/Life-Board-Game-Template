import { useCallback, useRef } from "react";

type GameSfxCue = "event" | "choice_result" | "round_end" | "game_result";

type AudioContextConstructor = new () => AudioContext;

function getAudioContextConstructor(): AudioContextConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  return window.AudioContext;
}

const CUE_PATTERNS: Record<GameSfxCue, number[]> = {
  event: [440, 660],
  choice_result: [520, 780, 620],
  round_end: [330, 247],
  game_result: [392, 523, 659, 784],
};

export function useGameSfx() {
  const contextRef = useRef<AudioContext | null>(null);

  const getContext = useCallback(() => {
    const ExistingContext = getAudioContextConstructor();
    if (!ExistingContext) return null;

    try {
      const context = contextRef.current ?? new ExistingContext();
      contextRef.current = context;
      if (context.state === "suspended") {
        void context.resume().catch(() => undefined);
      }
      return context;
    } catch {
      return null;
    }
  }, []);

  const play = useCallback(
    (cue: GameSfxCue) => {
      const context = getContext();
      if (!context) return;

      try {
        const now = context.currentTime;
        CUE_PATTERNS[cue].forEach((frequency, index) => {
          const start = now + index * 0.09;
          const oscillator = context.createOscillator();
          const gain = context.createGain();

          oscillator.type = cue === "round_end" ? "triangle" : "sine";
          oscillator.frequency.setValueAtTime(frequency, start);
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(0.08, start + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);

          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(start);
          oscillator.stop(start + 0.18);
        });
      } catch {
        // WebAudio can be blocked until user interaction; sound is optional.
      }
    },
    [getContext],
  );

  return { play };
}
