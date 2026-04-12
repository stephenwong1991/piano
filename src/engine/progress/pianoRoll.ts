export const PIANO_ROLL_GRID_STEPS = [1, 0.5, 0.25] as const;

export const SEEK_QUANTIZE_MODES = [
  { key: "off", label: "关闭吸附", step: 0 },
  { key: "beat", label: "按拍吸附", step: 1 },
  { key: "bar", label: "按小节吸附", step: 4 }
] as const;

export function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function getGridStepBeat(gridDensityIndex: number) {
  return PIANO_ROLL_GRID_STEPS[gridDensityIndex] || 1;
}

export function getSeekQuantizeMode(seekQuantizeModeIndex: number) {
  return SEEK_QUANTIZE_MODES[seekQuantizeModeIndex] || SEEK_QUANTIZE_MODES[0];
}

export function getGridDensityLabel(gridDensityIndex: number) {
  const step = getGridStepBeat(gridDensityIndex);
  if (step === 1) return "1/4 拍";
  if (step === 0.5) return "1/8 拍";
  return "1/16 拍";
}

export function quantizeBeat(beat: number, maxBeat: number, seekQuantizeModeIndex: number) {
  const mode = getSeekQuantizeMode(seekQuantizeModeIndex);
  if (!mode || mode.step <= 0) {
    return Math.max(0, Math.min(maxBeat, beat));
  }
  const snapped = Math.round(beat / mode.step) * mode.step;
  return Math.max(0, Math.min(maxBeat, snapped));
}
