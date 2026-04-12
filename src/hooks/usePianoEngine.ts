import { useLayoutEffect, useState } from "react";
import * as Tone from "tone";
import { disposePianoApp, initializePianoApp } from "@/engine/pianoEngine";
import type { PianoDomRefs } from "@/hooks/usePianoDomRefs";

interface PianoEngineOptions {
  dom: PianoDomRefs;
}

export function usePianoEngine(options: PianoEngineOptions) {
  const [bootError, setBootError] = useState("");
  const { dom } = options;

  useLayoutEffect(() => {
    let cancelled = false;
    window.Tone = Tone;

    const run = async () => {
      await new Promise<void>((r) => {
        requestAnimationFrame(() => requestAnimationFrame(() => r()));
      });
      if (cancelled) return;
      try {
        await initializePianoApp({ dom });
        if (!cancelled) {
          setBootError("");
        }
      } catch (error) {
        if (!cancelled) {
          setBootError(error instanceof Error ? error.message : String(error));
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      disposePianoApp();
    };
  }, [dom]);

  return { bootError };
}
