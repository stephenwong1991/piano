import { useMemo, useRef } from "react";

/**
 * DOM 节点由 React 挂载后交给钢琴引擎；`useRef` 引用稳定，避免每帧新建 ref 对象。
 */
export function usePianoDomRefs() {
  const piano = useRef<HTMLDivElement | null>(null);
  const status = useRef<HTMLDivElement | null>(null);
  const volume = useRef<HTMLInputElement | null>(null);
  const volumeValue = useRef<HTMLSpanElement | null>(null);
  const keyboardBase = useRef<HTMLSelectElement | null>(null);
  const keyboardBaseList = useRef<HTMLDivElement | null>(null);
  const tempoScale = useRef<HTMLInputElement | null>(null);
  const tempoScaleValue = useRef<HTMLSpanElement | null>(null);
  const playbackMode = useRef<HTMLSelectElement | null>(null);
  const modeTabMelody = useRef<HTMLButtonElement | null>(null);
  const modeTabRaw = useRef<HTMLButtonElement | null>(null);
  const scorePlaylist = useRef<HTMLDivElement | null>(null);
  const scoreFile = useRef<HTMLInputElement | null>(null);
  const playPauseBtn = useRef<HTMLButtonElement | null>(null);
  const stopBtn = useRef<HTMLButtonElement | null>(null);
  const bootLoadingOverlay = useRef<HTMLDivElement | null>(null);
  const bootLoadingPercent = useRef<HTMLParagraphElement | null>(null);
  const progressCanvas = useRef<HTMLCanvasElement | null>(null);
  const tempoBadge = useRef<HTMLSpanElement | null>(null);
  const statusBadge = useRef<HTMLSpanElement | null>(null);
  const engineBadge = useRef<HTMLSpanElement | null>(null);
  const gridBadge = useRef<HTMLSpanElement | null>(null);
  const quantizeBadge = useRef<HTMLSpanElement | null>(null);

  return useMemo(
    () => ({
      piano,
      status,
      volume,
      volumeValue,
      keyboardBase,
      keyboardBaseList,
      tempoScale,
      tempoScaleValue,
      playbackMode,
      modeTabMelody,
      modeTabRaw,
      scorePlaylist,
      scoreFile,
      playPauseBtn,
      stopBtn,
      bootLoadingOverlay,
      bootLoadingPercent,
      progressCanvas,
      tempoBadge,
      statusBadge,
      engineBadge,
      gridBadge,
      quantizeBadge
    }),
    []
  );
}

export type PianoDomRefs = ReturnType<typeof usePianoDomRefs>;
