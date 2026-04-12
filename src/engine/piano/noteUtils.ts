import { MAX_MIDI, MIN_MIDI, NOTE_NAMES } from "@/engine/piano/constants";

export function midiToFrequency(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function midiToNoteName(midi: number) {
  const noteClass = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[noteClass]}${octave}`;
}

export function noteNameToMidi(note: string) {
  const normalized = String(note).trim().toUpperCase();
  const match = normalized.match(/^([A-G])(#?)(-?\d)$/);
  if (!match) {
    return null;
  }
  const [, base, sharp, octaveStr] = match;
  const noteKey = `${base}${sharp}`;
  const noteIndex = NOTE_NAMES.indexOf(noteKey);
  if (noteIndex < 0) {
    return null;
  }
  const octave = Number(octaveStr);
  const midi = (octave + 1) * 12 + noteIndex;
  if (midi < MIN_MIDI || midi > MAX_MIDI) {
    return null;
  }
  return midi;
}
