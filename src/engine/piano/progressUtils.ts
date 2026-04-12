export function getProgressViewSpan(maxBeat: number) {
  if (maxBeat <= 0) return 1;
  if (maxBeat <= 64) return maxBeat;
  return Math.min(maxBeat, 64);
}

export function clampProgressViewStart(startBeat: number, maxBeat: number, viewSpanBeat: number) {
  const maxStart = Math.max(0, maxBeat - viewSpanBeat);
  return Math.max(0, Math.min(maxStart, startBeat));
}

export function getProgressViewRange(
  progressViewStartBeat: number,
  maxBeat: number
): { startBeat: number; endBeat: number; spanBeat: number; nextProgressViewStartBeat: number } {
  const viewSpanBeat = getProgressViewSpan(maxBeat);
  const nextProgressViewStartBeat = clampProgressViewStart(progressViewStartBeat, maxBeat, viewSpanBeat);
  return {
    startBeat: nextProgressViewStartBeat,
    endBeat: nextProgressViewStartBeat + viewSpanBeat,
    spanBeat: viewSpanBeat,
    nextProgressViewStartBeat
  };
}

export function updateProgressViewStartForAutoFollow(
  playBeat: number,
  maxBeat: number,
  progressViewStartBeat: number
): number {
  const viewSpanBeat = getProgressViewSpan(maxBeat);
  const centerBeat = progressViewStartBeat + viewSpanBeat / 2;
  if (playBeat <= centerBeat) return progressViewStartBeat;
  return clampProgressViewStart(playBeat - viewSpanBeat / 2, maxBeat, viewSpanBeat);
}
