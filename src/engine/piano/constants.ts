export const MIN_MIDI = 21; // A0
export const MAX_MIDI = 108; // C8
export const WHITE_KEY_COUNT = 52;

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const BLACK_CLASSES = new Set([1, 3, 6, 8, 10]);

export const KEYBOARD_LAYOUT = [
  { code: "KeyZ", offset: 0 },
  { code: "KeyS", offset: 1 },
  { code: "KeyX", offset: 2 },
  { code: "KeyD", offset: 3 },
  { code: "KeyC", offset: 4 },
  { code: "KeyV", offset: 5 },
  { code: "KeyG", offset: 6 },
  { code: "KeyB", offset: 7 },
  { code: "KeyH", offset: 8 },
  { code: "KeyN", offset: 9 },
  { code: "KeyJ", offset: 10 },
  { code: "KeyM", offset: 11 },
  { code: "Comma", offset: 12 },
  { code: "KeyL", offset: 13 },
  { code: "Period", offset: 14 },
  { code: "Semicolon", offset: 15 },
  { code: "Slash", offset: 16 },
  { code: "KeyQ", offset: 12 },
  { code: "Digit2", offset: 13 },
  { code: "KeyW", offset: 14 },
  { code: "Digit3", offset: 15 },
  { code: "KeyE", offset: 16 },
  { code: "KeyR", offset: 17 },
  { code: "Digit5", offset: 18 },
  { code: "KeyT", offset: 19 },
  { code: "Digit6", offset: 20 },
  { code: "KeyY", offset: 21 },
  { code: "Digit7", offset: 22 },
  { code: "KeyU", offset: 23 }
] as const;

export const KEYBOARD_MAP = new Map<string, number>(KEYBOARD_LAYOUT.map((item) => [item.code, item.offset]));
