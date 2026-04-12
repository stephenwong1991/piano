/**
 * 与 `assets/samples/salamander/sprite.mp3` 中片段顺序一致（ffmpeg concat 顺序）。
 * 若重新拼接 sprite，请用 ffprobe 各段时长后更新 `startSec` / `durationSec`，或运行
 * `node scripts/build-sample-sprite.mjs` 重新生成下列数值。
 */
export const SAMPLE_SPRITE_CLIP_ORDER = [
  "A0",
  "C1",
  "D#1",
  "F#1",
  "A1",
  "C2",
  "D#2",
  "F#2",
  "A2",
  "C3",
  "D#3",
  "F#3",
  "A3",
  "C4",
  "D#4",
  "F#4",
  "A4",
  "C5",
  "D#5",
  "F#5",
  "A5",
  "C6",
  "D#6",
  "F#6",
  "A6",
  "C7",
  "D#7",
  "F#7",
  "A7",
  "C8"
] as const;

export type SampleSpriteClipNote = (typeof SAMPLE_SPRITE_CLIP_ORDER)[number];

export type SampleSpriteCue = {
  /** 在整轨 sprite 解码后的时间轴上的起点（秒） */
  startSec: number;
  /** 片段长度（秒），与解码后切片一致 */
  durationSec: number;
};

/**
 * 键名须与 `SAMPLE_PIANO_URLS` / Tone Sampler 的 note 一致。
 */
export const SAMPLE_SPRITE_CUES: Record<SampleSpriteClipNote, SampleSpriteCue> = {
  A0: { startSec: 0, durationSec: 25.051429 },
  C1: { startSec: 25.051429, durationSec: 23.666939 },
  "D#1": { startSec: 48.718368, durationSec: 24.32 },
  "F#1": { startSec: 73.038368, durationSec: 23.379592 },
  A1: { startSec: 96.41796, durationSec: 23.353469 },
  C2: { startSec: 119.771429, durationSec: 22.360816 },
  "D#2": { startSec: 142.132245, durationSec: 22.151837 },
  "F#2": { startSec: 164.284082, durationSec: 20.48 },
  A2: { startSec: 184.764082, durationSec: 15.986939 },
  C3: { startSec: 200.751021, durationSec: 16.039184 },
  "D#3": { startSec: 216.790205, durationSec: 16.117551 },
  "F#3": { startSec: 232.907756, durationSec: 16.169796 },
  A3: { startSec: 249.077552, durationSec: 15.647347 },
  C4: { startSec: 264.724899, durationSec: 16.222041 },
  "D#4": { startSec: 280.94694, durationSec: 15.856327 },
  "F#4": { startSec: 296.803267, durationSec: 14.733061 },
  A4: { startSec: 311.536328, durationSec: 13.374694 },
  C5: { startSec: 324.911022, durationSec: 15.595102 },
  "D#5": { startSec: 340.506124, durationSec: 12.982857 },
  "F#5": { startSec: 353.488981, durationSec: 11.964082 },
  A5: { startSec: 365.453063, durationSec: 10.579592 },
  C6: { startSec: 376.032655, durationSec: 6.269388 },
  "D#6": { startSec: 382.302043, durationSec: 6.739592 },
  "F#6": { startSec: 389.041635, durationSec: 5.877551 },
  A6: { startSec: 394.919186, durationSec: 6.844082 },
  C7: { startSec: 401.763268, durationSec: 4.127347 },
  "D#7": { startSec: 405.890615, durationSec: 4.91102 },
  "F#7": { startSec: 410.801635, durationSec: 4.858776 },
  A7: { startSec: 415.660411, durationSec: 4.075102 },
  C8: { startSec: 419.735513, durationSec: 3.918367 }
};
