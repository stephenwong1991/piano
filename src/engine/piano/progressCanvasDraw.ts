import type { PlayableScore, ScoreEvent } from "@/engine/midi/midi";
import { MAX_MIDI, MIN_MIDI } from "@/engine/piano/constants";
import {
  PIANO_ROLL_BOTTOM_PAD,
  PIANO_ROLL_LABEL_GUTTER_MULTI,
  PIANO_ROLL_LABEL_GUTTER_SINGLE,
  PIANO_ROLL_TIMELINE_BAND,
  PIANO_ROLL_TOP_GAP
} from "@/engine/piano/progressLayoutConstants";
import { getProgressViewRange, updateProgressViewStartForAutoFollow } from "@/engine/piano/progressUtils";
import { formatTime, getGridStepBeat } from "@/engine/progress/pianoRoll";

const RIGHT_PAD = 12;

/** 多 MIDI 轨道卷帘配色（与 `ScoreEvent.trackIndex` 对应） */
const TRACK_NOTE_RGB: Array<[number, number, number]> = [
  [56, 189, 248],
  [167, 139, 250],
  [52, 211, 153],
  [251, 191, 36],
  [248, 113, 113],
  [147, 197, 253]
];

/**
 * 卷帘条长 = 谱面时值（未踏板延长的部分）；延音只体现在音频，不拉长卷帘条
 */
function scoreEventDisplayDurationBeats(e: ScoreEvent): number {
  return e.durationVisual ?? e.duration;
}

function noteFillForTrack(trackIndex: number | undefined, velAlpha: number) {
  const i = (trackIndex ?? 0) % TRACK_NOTE_RGB.length;
  const [r, g, b] = TRACK_NOTE_RGB[i];
  return `rgba(${r},${g},${b},${velAlpha.toFixed(3)})`;
}

function collectTrackIds(viewScore: PlayableScore): number[] {
  const ids = new Set<number>();
  viewScore.events.forEach((e) => ids.add(e.trackIndex ?? 0));
  return [...ids].sort((a, b) => a - b);
}

function layoutMetrics(width: number, height: number, viewScore: PlayableScore) {
  const trackIds = collectTrackIds(viewScore);
  const multi = trackIds.length > 1;
  const labelGutter = multi ? PIANO_ROLL_LABEL_GUTTER_MULTI : PIANO_ROLL_LABEL_GUTTER_SINGLE;
  const rollTop = PIANO_ROLL_TIMELINE_BAND + PIANO_ROLL_TOP_GAP;
  const left = labelGutter + 8;
  const drawWidth = Math.max(120, width - left - RIGHT_PAD);
  const drawHeight = Math.max(32, height - rollTop - PIANO_ROLL_BOTTOM_PAD);
  return { multi, trackIds, labelGutter, rollTop, left, drawWidth, drawHeight };
}

/** 与绘制逻辑一致的横向可拖拽区域，供进度跳转计算使用 */
export function getSeekLayoutForCanvas(progressCanvasEl: HTMLCanvasElement, viewScore: PlayableScore | null) {
  const rect = progressCanvasEl.getBoundingClientRect();
  const width = Math.max(280, Math.floor(rect.width || 720));
  const height = Math.max(96, Math.floor(rect.height || 92));
  if (!viewScore?.events?.length) {
    const left = PIANO_ROLL_LABEL_GUTTER_SINGLE + 6;
    return { left, drawWidth: Math.max(120, width - left - RIGHT_PAD) };
  }
  const m = layoutMetrics(width, height, viewScore);
  return { left: m.left, drawWidth: m.drawWidth };
}

export interface PianoRollDrawDeps {
  progressCanvasEl: HTMLCanvasElement;
  /** 由引擎 ResizeObserver 提供时可避免每帧 getBoundingClientRect，减轻跟拍卡顿 */
  paintWidth?: number;
  /** 与 CSS 高度一致（getRecommendedProgressCanvasHeightPx），避免布局读取 */
  paintHeight?: number;
  viewScore: PlayableScore | null;
  isPlayingScore: boolean;
  isPausedScore: boolean;
  isSeekingProgress: boolean;
  seekPreviewBeat: number | null;
  playbackStartBeat: number;
  getPlaybackBeatNow: () => number;
  gridDensityIndex: number;
  seekQuantizeModeIndex: number;
  hoverBeat: number | null;
  hoverX: number;
  hoverY: number;
  playbackSecPerBeat: number;
  progressViewStartBeat: number;
  autoFollowPlayhead: boolean;
}

export interface PianoRollDrawResult {
  progressViewStartBeat: number;
}

function drawTimelineGrid(
  ctx: CanvasRenderingContext2D,
  view: { startBeat: number; endBeat: number; spanBeat: number },
  maxBeat: number,
  beatStep: number,
  rollTop: number,
  left: number,
  drawWidth: number,
  drawBottom: number
) {
  const gridStartBeat = Math.floor(view.startBeat / beatStep) * beatStep;
  for (let beat = gridStartBeat; beat <= view.endBeat + beatStep * 0.5; beat += beatStep) {
    if (beat < 0 || beat > maxBeat) continue;
    const x = left + ((beat - view.startBeat) / view.spanBeat) * drawWidth;
    const isBar = beat % 4 === 0;
    ctx.strokeStyle = isBar ? "rgba(148, 163, 184, 0.4)" : "rgba(148, 163, 184, 0.14)";
    ctx.lineWidth = isBar ? 1.2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, rollTop);
    ctx.lineTo(x, drawBottom);
    ctx.stroke();
    if (isBar && x >= left - 2) {
      ctx.fillStyle = "rgba(226, 232, 240, 0.88)";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(`${Math.floor(beat / 4) + 1}`, x + 2, 16);
    }
  }
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  const ell = "…";
  while (t.length > 1 && ctx.measureText(t + ell).width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + ell;
}

export function drawPianoRollFrame(deps: PianoRollDrawDeps): PianoRollDrawResult | null {
  const { progressCanvasEl } = deps;
  const rect = progressCanvasEl.getBoundingClientRect();
  const width = Math.max(
    280,
    Math.floor(
      deps.paintWidth && deps.paintWidth > 0 ? deps.paintWidth : rect.width > 0 ? rect.width : 720
    )
  );
  const height = Math.max(
    96,
    Math.floor(
      deps.paintHeight && deps.paintHeight > 0 ? deps.paintHeight : rect.height > 0 ? rect.height : 92
    )
  );
  const dpr = window.devicePixelRatio || 1;
  if (progressCanvasEl.width !== Math.floor(width * dpr) || progressCanvasEl.height !== Math.floor(height * dpr)) {
    progressCanvasEl.width = Math.floor(width * dpr);
    progressCanvasEl.height = Math.floor(height * dpr);
  }
  const ctx =
    progressCanvasEl.getContext("2d", {
      alpha: true,
      desynchronized: true
    } as CanvasRenderingContext2DSettings) || progressCanvasEl.getContext("2d");
  if (!ctx) return null;

  let progressViewStartBeat = deps.progressViewStartBeat;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, "#020617");
  grad.addColorStop(0.5, "#0f172a");
  grad.addColorStop(1, "#020617");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  if (!deps.viewScore || !Array.isArray(deps.viewScore.events) || deps.viewScore.events.length === 0) {
    ctx.fillStyle = "rgba(226, 232, 240, 0.9)";
    ctx.font = "12px sans-serif";
    ctx.fillText("暂无可视化曲谱", 12, 24);
    return { progressViewStartBeat };
  }

  const viewScore = deps.viewScore;
  const maxBeat = Math.max(1, ...viewScore.events.map((e) => e.beat + e.duration));
  const playBeat =
    deps.isSeekingProgress && typeof deps.seekPreviewBeat === "number"
      ? deps.seekPreviewBeat
      : deps.isPlayingScore
        ? deps.getPlaybackBeatNow()
        : deps.isPausedScore
          ? deps.playbackStartBeat
          : 0;
  const clampedPlayBeat = Math.min(maxBeat, Math.max(0, playBeat));

  if (deps.isPlayingScore && deps.autoFollowPlayhead) {
    progressViewStartBeat = updateProgressViewStartForAutoFollow(clampedPlayBeat, maxBeat, progressViewStartBeat);
  }

  const { multi, trackIds, labelGutter, rollTop, left, drawWidth, drawHeight } = layoutMetrics(width, height, viewScore);
  const beatStep = getGridStepBeat(deps.gridDensityIndex);
  const view = getProgressViewRange(progressViewStartBeat, maxBeat);
  progressViewStartBeat = view.nextProgressViewStartBeat;
  const beatsPerPixel = view.spanBeat / drawWidth;
  const drawBottom = rollTop + drawHeight;

  ctx.fillStyle = "rgba(15, 23, 42, 0.55)";
  ctx.fillRect(0, 0, width, PIANO_ROLL_TIMELINE_BAND);

  ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(left, rollTop, drawWidth, drawHeight);

  drawTimelineGrid(ctx, view, maxBeat, beatStep, rollTop, left, drawWidth, drawBottom);

  if (multi) {
    ctx.fillStyle = "rgba(15, 23, 42, 0.94)";
    ctx.fillRect(0, rollTop, labelGutter, drawBottom - rollTop);
    ctx.strokeStyle = "rgba(56, 189, 248, 0.2)";
    ctx.strokeRect(0, rollTop, labelGutter, drawBottom - rollTop);
  }

  if (multi) {
    const laneH = drawHeight / trackIds.length;
    trackIds.forEach((tid, ti) => {
      const laneTop = rollTop + ti * laneH;
      const laneInnerH = Math.max(14, laneH - 8);
      if (ti > 0) {
        ctx.strokeStyle = "rgba(148, 163, 184, 0.22)";
        ctx.beginPath();
        ctx.moveTo(labelGutter, laneTop);
        ctx.lineTo(left + drawWidth, laneTop);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(203, 213, 225, 0.95)";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const handLabel = ti === 0 ? "右手" : ti === 1 ? "左手" : `轨${tid + 1}`;
      const labelStr = `轨道 ${tid + 1}（${handLabel}）`;
      const maxLabelW = labelGutter - 14;
      ctx.fillText(truncateText(ctx, labelStr, maxLabelW), 8, laneTop + laneH / 2);

      const trackEvents = viewScore.events.filter((e) => (e.trackIndex ?? 0) === tid);
      const pitches = trackEvents.flatMap((e) => e.midiList);
      const pMin = pitches.length ? Math.min(...pitches) : MIN_MIDI;
      const pMax = pitches.length ? Math.max(...pitches) : MAX_MIDI;
      const pRange = Math.max(12, pMax - pMin);

      trackEvents.forEach((event) => {
        const visDur = scoreEventDisplayDurationBeats(event);
        if (event.beat > view.endBeat || event.beat + visDur < view.startBeat) return;
        const midi = event.midiList && event.midiList[0] ? event.midiList[0] : 60;
        const x = left + ((event.beat - view.startBeat) / view.spanBeat) * drawWidth;
        const w = Math.max(1.5, visDur / beatsPerPixel);
        const clampedX = Math.max(left, x);
        const maxW = left + drawWidth - clampedX;
        if (maxW <= 0) return;
        const clampedW = Math.max(1, Math.min(w, maxW));
        const normalized = Math.min(1, Math.max(0, (midi - pMin) / pRange));
        const noteHeight = Math.max(2, laneInnerH / 14);
        const y = laneTop + 4 + (1 - normalized) * (laneInnerH - noteHeight);
        const vel = Math.min(127, Math.max(1, Number(event.velocity) || 100));
        const alpha = 0.32 + (vel / 127) * 0.48;
        ctx.fillStyle = noteFillForTrack(event.trackIndex, alpha);
        ctx.fillRect(clampedX, y, clampedW, noteHeight);
      });
    });
  } else {
    const laneCount = 8;
    for (let lane = 0; lane <= laneCount; lane += 1) {
      const y = rollTop + (lane / laneCount) * drawHeight;
      ctx.strokeStyle = lane % 2 === 0 ? "rgba(148, 163, 184, 0.12)" : "rgba(148, 163, 184, 0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + drawWidth, y);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(186, 230, 253, 0.85)";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("高", 10, rollTop + 14);
    ctx.fillText("低", 10, drawBottom - 8);

    viewScore.events.forEach((event) => {
      const visDur = scoreEventDisplayDurationBeats(event);
      if (event.beat > view.endBeat || event.beat + visDur < view.startBeat) return;
      const midi = event.midiList && event.midiList[0] ? event.midiList[0] : 60;
      const x = left + ((event.beat - view.startBeat) / view.spanBeat) * drawWidth;
      const w = Math.max(1.5, visDur / beatsPerPixel);
      const clampedX = Math.max(left, x);
      const maxW = left + drawWidth - clampedX;
      if (maxW <= 0) return;
      const clampedW = Math.max(1, Math.min(w, maxW));
      const normalized = Math.min(1, Math.max(0, (midi - MIN_MIDI) / (MAX_MIDI - MIN_MIDI)));
      const noteHeight = Math.max(2, drawHeight / 28);
      const y = rollTop + (1 - normalized) * (drawHeight - noteHeight);
      const vel = Math.min(127, Math.max(1, Number(event.velocity) || 100));
      const alpha = 0.3 + (vel / 127) * 0.5;
      ctx.fillStyle = noteFillForTrack(event.trackIndex, alpha);
      ctx.fillRect(clampedX, y, clampedW, noteHeight);
    });
  }

  const playX = left + ((clampedPlayBeat - view.startBeat) / view.spanBeat) * drawWidth;
  const indicatorX = Math.max(left, Math.min(left + drawWidth, playX));
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, rollTop, drawWidth, drawBottom - rollTop);
  ctx.clip();
  ctx.strokeStyle = "#fbbf24";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(playX, rollTop);
  ctx.lineTo(playX, drawBottom);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "#fbbf24";
  ctx.beginPath();
  ctx.moveTo(indicatorX, rollTop);
  ctx.lineTo(indicatorX - 4, rollTop - 7);
  ctx.lineTo(indicatorX + 4, rollTop - 7);
  ctx.closePath();
  ctx.fill();

  const progress = Math.round((Math.min(maxBeat, playBeat) / maxBeat) * 100);
  const secPerBeat =
    deps.isPlayingScore || deps.isPausedScore ? deps.playbackSecPerBeat : 60 / (Number(viewScore.tempo) || 90);
  const elapsedSec = Math.max(0, playBeat * secPerBeat);
  const totalSec = Math.max(0, maxBeat * secPerBeat);
  const trackLabel = (viewScore.midiTracksDetected ?? 0) > 1 ? ` · ${viewScore.midiTracksDetected} 轨` : "";

  const footerTitleY = height - 24;
  const footerTimeY = height - 9;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = "11px sans-serif";
  ctx.fillStyle = "rgba(148, 163, 184, 0.9)";
  const titleMaxW = width - 16;
  const titleLine = truncateText(ctx, viewScore.title, titleMaxW);
  ctx.fillText(titleLine, 10, footerTitleY);
  ctx.fillStyle = "rgba(248, 250, 252, 0.95)";
  ctx.font = "12px sans-serif";
  ctx.fillText(`${progress}% · ${formatTime(elapsedSec)} / ${formatTime(totalSec)}${trackLabel}`, 10, footerTimeY);

  if (maxBeat > view.spanBeat + 0.01) {
    ctx.font = "10px sans-serif";
    ctx.textBaseline = "alphabetic";
    const rangeText = `${view.startBeat.toFixed(1)}–${view.endBeat.toFixed(1)} 拍`;
    const rangeW = ctx.measureText(rangeText).width;
    const tip = "Shift/Alt 拖移 · 滚轮平移";
    const row2Y = 34;
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(125, 211, 252, 0.95)";
    ctx.fillText(rangeText, width - 8, row2Y);
    ctx.textAlign = "left";
    const tipMax = Math.max(60, width - rangeW - 24);
    ctx.fillStyle = "rgba(148, 163, 184, 0.88)";
    ctx.fillText(truncateText(ctx, tip, tipMax), 8, row2Y);
  }

  if (deps.hoverBeat !== null) {
    const clampedHover = Math.max(0, Math.min(maxBeat, deps.hoverBeat));
    const hoverSec = clampedHover * secPerBeat;
    const tipText = `${clampedHover.toFixed(2)} 拍 · ${formatTime(hoverSec)}`;
    ctx.font = "11px sans-serif";
    const textWidth = ctx.measureText(tipText).width;
    const tipWidth = textWidth + 14;
    const tipHeight = 20;
    const tipX = Math.max(6, Math.min(width - tipWidth - 6, deps.hoverX - tipWidth / 2));
    const tipY = Math.max(
      PIANO_ROLL_TIMELINE_BAND + 4,
      Math.min(height - tipHeight - PIANO_ROLL_BOTTOM_PAD - 4, deps.hoverY - 28)
    );
    ctx.fillStyle = "rgba(15, 23, 42, 0.94)";
    ctx.fillRect(tipX, tipY, tipWidth, tipHeight);
    ctx.strokeStyle = "rgba(56, 189, 248, 0.45)";
    ctx.strokeRect(tipX, tipY, tipWidth, tipHeight);
    ctx.fillStyle = "rgba(248, 250, 252, 0.95)";
    ctx.fillText(tipText, tipX + 7, tipY + 14);
  }

  return { progressViewStartBeat };
}

export function calcSeekBeatFromClientX(
  clientX: number,
  progressCanvasEl: HTMLCanvasElement,
  maxBeat: number,
  progressViewStartBeat: number,
  viewScore: PlayableScore | null
) {
  const { left, drawWidth } = getSeekLayoutForCanvas(progressCanvasEl, viewScore);
  const rect = progressCanvasEl.getBoundingClientRect();
  const x = clientX - rect.left;
  const ratio = Math.max(0, Math.min(1, (x - left) / drawWidth));
  const view = getProgressViewRange(progressViewStartBeat, maxBeat);
  return view.startBeat + ratio * view.spanBeat;
}
