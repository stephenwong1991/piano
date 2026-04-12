import type { PianoDomRefs } from "@/hooks/usePianoDomRefs";

export type ResolvedPianoDom = {
  piano: HTMLDivElement;
  status: HTMLDivElement;
  volume: HTMLInputElement;
  volumeValue: HTMLSpanElement;
  keyboardBase: HTMLSelectElement;
  keyboardBaseList: HTMLDivElement;
  tempoScale: HTMLInputElement;
  tempoScaleValue: HTMLSpanElement;
  playbackMode: HTMLSelectElement;
  modeTabMelody: HTMLButtonElement;
  modeTabRaw: HTMLButtonElement;
  scorePlaylist: HTMLDivElement;
  scoreFile: HTMLInputElement;
  playPauseBtn: HTMLButtonElement;
  stopBtn: HTMLButtonElement;
  bootLoadingOverlay: HTMLDivElement;
  bootLoadingPercent: HTMLParagraphElement;
  progressCanvas: HTMLCanvasElement;
  tempoBadge: HTMLSpanElement;
  statusBadge: HTMLSpanElement;
  engineBadge: HTMLSpanElement;
  gridBadge: HTMLSpanElement;
  quantizeBadge: HTMLSpanElement;
};

function req<T extends HTMLElement>(name: string, el: T | null): T {
  if (!el) {
    throw new Error(`钢琴界面未就绪：缺少 ${name}`);
  }
  return el;
}

export function resolvePianoDom(refs: PianoDomRefs): ResolvedPianoDom {
  return {
    piano: req("piano", refs.piano.current),
    status: req("status", refs.status.current),
    volume: req("volume", refs.volume.current),
    volumeValue: req("volumeValue", refs.volumeValue.current),
    keyboardBase: req("keyboardBase", refs.keyboardBase.current),
    keyboardBaseList: req("keyboardBaseList", refs.keyboardBaseList.current),
    tempoScale: req("tempoScale", refs.tempoScale.current),
    tempoScaleValue: req("tempoScaleValue", refs.tempoScaleValue.current),
    playbackMode: req("playbackMode", refs.playbackMode.current),
    modeTabMelody: req("modeTabMelody", refs.modeTabMelody.current),
    modeTabRaw: req("modeTabRaw", refs.modeTabRaw.current),
    scorePlaylist: req("scorePlaylist", refs.scorePlaylist.current),
    scoreFile: req("scoreFile", refs.scoreFile.current),
    playPauseBtn: req("playPauseBtn", refs.playPauseBtn.current),
    stopBtn: req("stopBtn", refs.stopBtn.current),
    bootLoadingOverlay: req("bootLoadingOverlay", refs.bootLoadingOverlay.current),
    bootLoadingPercent: req("bootLoadingPercent", refs.bootLoadingPercent.current),
    progressCanvas: req("progressCanvas", refs.progressCanvas.current),
    tempoBadge: req("tempoBadge", refs.tempoBadge.current),
    statusBadge: req("statusBadge", refs.statusBadge.current),
    engineBadge: req("engineBadge", refs.engineBadge.current),
    gridBadge: req("gridBadge", refs.gridBadge.current),
    quantizeBadge: req("quantizeBadge", refs.quantizeBadge.current)
  };
}
