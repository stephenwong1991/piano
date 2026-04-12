import type { PlayableScore } from "@/engine/midi/midi";
import { quantizeBeat } from "@/engine/progress/pianoRoll";
import { calcSeekBeatFromClientX, getSeekLayoutForCanvas } from "@/engine/piano/progressCanvasDraw";
import { clampProgressViewStart, getProgressViewRange } from "@/engine/piano/progressUtils";
import { noteNameToMidi } from "@/engine/piano/noteUtils";
import { toPlayableScore } from "@/engine/midi/midi";

export interface ProgressRollApi {
  getViewScore(): PlayableScore | null;
  getSelectedScore(): PlayableScore | null;
  getPlaybackBeatNow(): number;
  getIsPlayingScore(): boolean;
  getIsPausedScore(): boolean;
  getIsSeekingProgress(): boolean;
  setIsSeekingProgress(v: boolean): void;
  getSeekPreviewBeat(): number | null;
  setSeekPreviewBeat(v: number | null): void;
  getPlaybackStartBeat(): number;
  getPlaybackSecPerBeat(): number;
  getGridDensityIndex(): number;
  getSeekQuantizeModeIndex(): number;
  getHoverBeat(): number | null;
  setHoverBeat(v: number | null): void;
  getHoverX(): number;
  setHoverX(v: number): void;
  getHoverY(): number;
  setHoverY(v: number): void;
  getProgressViewStartBeat(): number;
  setProgressViewStartBeat(v: number): void;
  getAutoFollowPlayhead(): boolean;
  setAutoFollowPlayhead(v: boolean): void;
  getIsPanningProgress(): boolean;
  setIsPanningProgress(v: boolean): void;
  getPanStartClientX(): number;
  setPanStartClientX(v: number): void;
  getPanStartViewBeat(): number;
  setPanStartViewBeat(v: number): void;
  seekToBeat(beat: number): void;
  drawProgressCanvas(): void;
  cycleGridDensity(): void;
  cycleSeekQuantizeMode(): void;
}

export function attachProgressCanvasSeek(canvas: HTMLCanvasElement, api: ProgressRollApi): () => void {
  const onPointerMove = (event: PointerEvent) => {
    const score =
      api.getViewScore() ||
      (api.getSelectedScore() ? toPlayableScore(api.getSelectedScore()!, noteNameToMidi) : null);
    if (!score) return;
    const maxBeat = Math.max(1, ...score.events.map((e) => e.beat + e.duration));
    if (api.getIsPanningProgress()) {
      const view = getProgressViewRange(api.getProgressViewStartBeat(), maxBeat);
      const { drawWidth } = getSeekLayoutForCanvas(canvas, score);
      const beatPerPixel = view.spanBeat / drawWidth;
      const deltaBeat = (event.clientX - api.getPanStartClientX()) * beatPerPixel;
      api.setProgressViewStartBeat(clampProgressViewStart(api.getPanStartViewBeat() - deltaBeat, maxBeat, view.spanBeat));
      api.setAutoFollowPlayhead(false);
      api.setHoverBeat(null);
      api.drawProgressCanvas();
      return;
    }
    const rawBeat = calcSeekBeatFromClientX(event.clientX, canvas, maxBeat, api.getProgressViewStartBeat(), score);
    api.setHoverBeat(rawBeat);
    api.setHoverX(event.clientX - canvas.getBoundingClientRect().left);
    api.setHoverY(event.clientY - canvas.getBoundingClientRect().top);
    if (api.getIsSeekingProgress()) {
      api.setSeekPreviewBeat(quantizeBeat(rawBeat, maxBeat, api.getSeekQuantizeModeIndex()));
    }
    api.drawProgressCanvas();
  };

  const onPointerUp = () => {
    if (api.getIsPanningProgress()) {
      api.setIsPanningProgress(false);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      return;
    }
    if (!api.getIsSeekingProgress()) return;
    api.setIsSeekingProgress(false);
    const preview = api.getSeekPreviewBeat();
    if (typeof preview === "number") {
      api.seekToBeat(preview);
    }
    api.setSeekPreviewBeat(null);
    api.drawProgressCanvas();
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  };

  const onPointerDown = (event: PointerEvent) => {
    const score =
      api.getViewScore() ||
      (api.getSelectedScore() ? toPlayableScore(api.getSelectedScore()!, noteNameToMidi) : null);
    if (!score) return;
    const maxBeat = Math.max(1, ...score.events.map((e) => e.beat + e.duration));
    if (event.shiftKey || event.altKey || event.button === 1) {
      const view = getProgressViewRange(api.getProgressViewStartBeat(), maxBeat);
      api.setIsPanningProgress(true);
      api.setPanStartClientX(event.clientX);
      api.setPanStartViewBeat(view.startBeat);
      api.setAutoFollowPlayhead(false);
      api.setHoverBeat(null);
      api.drawProgressCanvas();
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      return;
    }
    api.setIsSeekingProgress(true);
    const rawBeat = calcSeekBeatFromClientX(event.clientX, canvas, maxBeat, api.getProgressViewStartBeat(), score);
    api.setSeekPreviewBeat(quantizeBeat(rawBeat, maxBeat, api.getSeekQuantizeModeIndex()));
    api.seekToBeat(api.getSeekPreviewBeat()!);
    api.setHoverBeat(rawBeat);
    api.setHoverX(event.clientX - canvas.getBoundingClientRect().left);
    api.setHoverY(event.clientY - canvas.getBoundingClientRect().top);
    api.drawProgressCanvas();
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const onPointerLeave = () => {
    if (api.getIsSeekingProgress() || api.getIsPanningProgress()) return;
    if (api.getIsPlayingScore()) {
      api.setAutoFollowPlayhead(true);
    }
    api.setHoverBeat(null);
    api.drawProgressCanvas();
  };

  const onWheel = (event: WheelEvent) => {
    const score =
      api.getViewScore() ||
      (api.getSelectedScore() ? toPlayableScore(api.getSelectedScore()!, noteNameToMidi) : null);
    if (!score) return;
    const maxBeat = Math.max(1, ...score.events.map((e) => e.beat + e.duration));
    const view = getProgressViewRange(api.getProgressViewStartBeat(), maxBeat);
    const { drawWidth } = getSeekLayoutForCanvas(canvas, score);
    const beatPerPixel = view.spanBeat / drawWidth;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    api.setProgressViewStartBeat(
      clampProgressViewStart(api.getProgressViewStartBeat() + delta * beatPerPixel, maxBeat, view.spanBeat)
    );
    api.setAutoFollowPlayhead(false);
    api.drawProgressCanvas();
    event.preventDefault();
  };

  const onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    if (event.shiftKey) {
      api.cycleSeekQuantizeMode();
    } else {
      api.cycleGridDensity();
    }
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", onContextMenu);

  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("contextmenu", onContextMenu);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  };
}
