import type { PlayableScore } from "@/engine/midi/midi";
import {
  PIANO_ROLL_BOTTOM_PAD,
  PIANO_ROLL_MULTI_MIN_LANE_PX,
  PIANO_ROLL_SINGLE_DEFAULT_HEIGHT_PX,
  PIANO_ROLL_TIMELINE_BAND,
  PIANO_ROLL_TOP_GAP
} from "@/engine/piano/progressLayoutConstants";

/** @deprecated 使用 PIANO_ROLL_BOTTOM_PAD */
export const PROGRESS_CANVAS_BOTTOM_PAD = PIANO_ROLL_BOTTOM_PAD;
export const PROGRESS_SINGLE_TRACK_HEIGHT_PX = PIANO_ROLL_SINGLE_DEFAULT_HEIGHT_PX;

function collectTrackIds(viewScore: PlayableScore): number[] {
  const ids = new Set<number>();
  viewScore.events.forEach((e) => ids.add(e.trackIndex ?? 0));
  return [...ids].sort((a, b) => a - b);
}

/**
 * 画布内容高度（可大于视口，由外层滚动）。多轨时按轨道数加高，不设上限。
 */
export function getRecommendedProgressCanvasHeightPx(viewScore: PlayableScore | null): number {
  if (!viewScore?.events?.length) return PIANO_ROLL_SINGLE_DEFAULT_HEIGHT_PX;
  const trackIds = collectTrackIds(viewScore);
  const rollTop = PIANO_ROLL_TIMELINE_BAND + PIANO_ROLL_TOP_GAP;
  if (trackIds.length <= 1) return PIANO_ROLL_SINGLE_DEFAULT_HEIGHT_PX;
  const contentH = trackIds.length * PIANO_ROLL_MULTI_MIN_LANE_PX;
  return Math.max(PIANO_ROLL_SINGLE_DEFAULT_HEIGHT_PX, Math.round(rollTop + contentH + PIANO_ROLL_BOTTOM_PAD));
}
