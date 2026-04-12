import { SAMPLE_PIANO_URLS } from "@/engine/audio/audioUtils";
import { SAMPLE_SPRITE_CUES, SAMPLE_SPRITE_CLIP_ORDER } from "@/engine/piano/sampleSpriteManifest";

const midiFileModules = import.meta.glob("../../../assets/midi/*.mid", {
  eager: true,
  query: "?url",
  import: "default"
}) as Record<string, string>;

const localPianoSampleModules = import.meta.glob(
  ["../../../assets/samples/salamander/*.mp3", "!../../../assets/samples/salamander/sprite.mp3"],
  {
    eager: true,
    query: "?url",
    import: "default"
  }
) as Record<string, string>;

/** 与逐文件 MP3 分开，避免 glob 把 sprite 当成普通键位文件 */
const spriteAssetModules = import.meta.glob("../../../assets/samples/salamander/sprite.mp3", {
  eager: true,
  query: "?url",
  import: "default"
}) as Record<string, string>;

export type SampleLoadPlan =
  | {
      mode: "sprite";
      url: string;
      cues: Record<string, { startSec: number; durationSec: number }>;
    }
  | { mode: "multi"; urls: Record<string, string> };

function getBundledSpriteUrl(): string | undefined {
  const url = Object.values(spriteAssetModules)[0];
  return typeof url === "string" && url.length > 0 ? url : undefined;
}

function spriteCuesCoverAllPianoKeys(): boolean {
  for (const note of Object.keys(SAMPLE_PIANO_URLS)) {
    const cue = SAMPLE_SPRITE_CUES[note as keyof typeof SAMPLE_SPRITE_CUES];
    if (!cue || cue.durationSec <= 0) return false;
  }
  return SAMPLE_SPRITE_CLIP_ORDER.length === Object.keys(SAMPLE_PIANO_URLS).length;
}

/**
 * 默认：存在 `sprite.mp3` 且 manifest 完整时用单文件 sprite（dev / build 同源）。
 * `VITE_SAMPLE_USE_SPRITE=false` 强制多文件；`VITE_SAMPLE_SPRITE_URL` 可覆盖 sprite 地址（如 CDN）。
 */
export function getSampleLoadPlan(): SampleLoadPlan {
  const flag = (import.meta.env.VITE_SAMPLE_USE_SPRITE ?? "").trim().toLowerCase();
  const forceOff = flag === "0" || flag === "false";
  const forceOn = flag === "1" || flag === "true";
  const spriteUrlOverride = (import.meta.env.VITE_SAMPLE_SPRITE_URL ?? "").trim();

  const bundled = getBundledSpriteUrl();
  const spriteUrl = spriteUrlOverride || bundled;
  const wantSprite = forceOn || (!forceOff && Boolean(spriteUrl));

  if (wantSprite && spriteUrl && spriteCuesCoverAllPianoKeys()) {
    return {
      mode: "sprite",
      url: spriteUrl,
      cues: SAMPLE_SPRITE_CUES as Record<string, { startSec: number; durationSec: number }>
    };
  }
  return { mode: "multi", urls: createSamplerUrls() };
}

export function toBuiltinTitle(fileName: string) {
  const base = decodeURIComponent(fileName.replace(/\.mid$/i, ""));
  return `${base}（MIDI内置）`;
}

export function isMidiUpload(file: File) {
  if (/\.(mid|midi)$/i.test(file.name)) return true;
  const mime = (file.type || "").toLowerCase();
  return mime === "audio/midi" || mime === "audio/x-midi" || mime === "application/x-midi";
}

export function toImportedMidiTitle(fileName: string) {
  const base = decodeURIComponent(fileName.replace(/\.(mid|midi)$/i, ""));
  return `${base || "导入曲谱"}（MIDI导入）`;
}

const midiNameCollator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });

/** 内置 MIDI 展示顺序（文件名小写，与 glob 解析一致） */
const BUILTIN_SCORE_ORDER = ["summer.mid", "十一月的肖邦.mid", "富士山下.mid"];

function builtinScoreRank(fileNameLower: string): number {
  const i = BUILTIN_SCORE_ORDER.indexOf(fileNameLower);
  return i === -1 ? 999 : i;
}

export const BUILTIN_SCORES = Object.entries(midiFileModules)
  .map(([modulePath, url]) => {
    const fileName = modulePath.split("/").pop() || "";
    return {
      title: toBuiltinTitle(fileName),
      file: url,
      fileName: fileName.toLowerCase()
    };
  })
  .sort((a, b) => {
    const ra = builtinScoreRank(a.fileName);
    const rb = builtinScoreRank(b.fileName);
    if (ra !== rb) return ra - rb;
    return midiNameCollator.compare(a.fileName, b.fileName);
  })
  .map(({ title, file }) => ({ title, file }));

export function createLocalSamplerUrls() {
  const fileNameToUrl = new Map<string, string>();
  Object.entries(localPianoSampleModules).forEach(([modulePath, url]) => {
    const fileName = decodeURIComponent(modulePath.split("/").pop() || "");
    fileNameToUrl.set(fileName, url);
  });

  const urls: Record<string, string> = {};
  Object.entries(SAMPLE_PIANO_URLS).forEach(([note, fileName]) => {
    const url = fileNameToUrl.get(fileName);
    if (url) {
      urls[note] = url;
    }
  });
  return urls;
}

/** Tone 官方托管的 Salamander 采样，与 `SAMPLE_PIANO_URLS` 文件名一致 */
const TONE_SALAMANDER_CDN = "https://tonejs.github.io/audio/salamander";

/**
 * 开发：本地 `assets/samples/salamander`（glob）。
 * 生产：默认从 Tone 官方 CDN 拉采样；可用 `VITE_SAMPLE_BASE_URL` 覆盖，或设为 `local`/`bundle` 强制用打包进 dist 的 MP3。
 */
export function createSamplerUrls(): Record<string, string> {
  if (!import.meta.env.PROD) {
    return createLocalSamplerUrls();
  }
  const raw = (import.meta.env.VITE_SAMPLE_BASE_URL ?? "").trim();
  if (raw === "local" || raw === "bundle") {
    return createLocalSamplerUrls();
  }
  const base = (raw || TONE_SALAMANDER_CDN).replace(/\/$/, "");
  const urls: Record<string, string> = {};
  Object.entries(SAMPLE_PIANO_URLS).forEach(([note, fileName]) => {
    urls[note] = `${base}/${fileName}`;
  });
  return urls;
}
