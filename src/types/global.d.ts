import type * as ToneType from "tone";

declare global {
  interface Window {
    Tone: typeof ToneType;
  }
}

export {};
