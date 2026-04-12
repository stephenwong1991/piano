#!/usr/bin/env node
/**
 * 按 `SAMPLE_SPRITE_CLIP_ORDER` 顺序拼接 `sprite.mp3`，并用 ffprobe 打印可粘贴进
 * `sampleSpriteManifest.ts` 的 `SAMPLE_SPRITE_CUES` 数值（需手工替换或自行合并）。
 *
 * 依赖：系统已安装 ffmpeg / ffprobe，且 `assets/samples/salamander/*.mp3` 齐全。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const sampleDir = path.join(root, "assets/samples/salamander");
const spritePath = path.join(sampleDir, "sprite.mp3");

const ORDER = [
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
];

const fileForNote = (note) => {
  const map = {
    "D#1": "Ds1",
    "F#1": "Fs1",
    "D#2": "Ds2",
    "F#2": "Fs2",
    "D#3": "Ds3",
    "F#3": "Fs3",
    "D#4": "Ds4",
    "F#4": "Fs4",
    "D#5": "Ds5",
    "F#5": "Fs5",
    "D#6": "Ds6",
    "F#6": "Fs6",
    "D#7": "Ds7",
    "F#7": "Fs7"
  };
  return `${map[note] ?? note}.mp3`;
};

function durationSec(file) {
  const out = execFileSync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    file
  ])
    .toString()
    .trim();
  return Number(out);
}

const lines = ORDER.map((note) => {
  const rel = fileForNote(note);
  const abs = path.join(sampleDir, rel);
  if (!fs.existsSync(abs)) {
    throw new Error(`missing sample: ${abs}`);
  }
  return `file '${abs.replace(/'/g, "'\\''")}'`;
});

const listPath = path.join(sampleDir, ".sprite-concat-list.txt");
fs.writeFileSync(listPath, `${lines.join("\n")}\n`, "utf8");

execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", spritePath], {
  stdio: "inherit"
});

let t = 0;
const cues = {};
for (const note of ORDER) {
  const abs = path.join(sampleDir, fileForNote(note));
  const d = durationSec(abs);
  cues[note] = { startSec: t, durationSec: d };
  t += d;
}

console.log("\n--- paste into SAMPLE_SPRITE_CUES (adjust formatting) ---\n");
for (const note of ORDER) {
  const { startSec, durationSec: dur } = cues[note];
  const key = /^[A-G][#b]?[0-9]$/.test(note) && note.includes("#") ? `"${note}"` : note;
  console.log(
    `  ${key}: { startSec: ${Number(startSec.toFixed(6))}, durationSec: ${Number(dur.toFixed(6))} },`
  );
}
console.log(`\n// sprite total ~${t.toFixed(3)}s — verify: ffprobe -show_entries format=duration ${spritePath}\n`);

fs.unlinkSync(listPath);
