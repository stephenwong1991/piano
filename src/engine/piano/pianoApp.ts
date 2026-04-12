import { midiToScore, normalizeScore, parseMidi, toPlayableScore, type PlayableScore } from "@/engine/midi/midi";
import {
  PIANO_ROLL_GRID_STEPS,
  SEEK_QUANTIZE_MODES,
  getGridDensityLabel,
  getSeekQuantizeMode,
  quantizeBeat
} from "@/engine/progress/pianoRoll";
import { isMidiUpload, toImportedMidiTitle } from "@/engine/piano/builtinAssets";
import { KEYBOARD_MAP, MAX_MIDI, MIN_MIDI } from "@/engine/piano/constants";
import type { ResolvedPianoDom } from "@/engine/piano/pianoDomResolve";
import { createPianoKeys, layoutPianoKeys, setKeyActive } from "@/engine/piano/keyboardView";
import { noteNameToMidi, midiToNoteName } from "@/engine/piano/noteUtils";
import { PianoAudio, startToneWithinMs } from "@/engine/piano/pianoAudio";
import { drawPianoRollFrame } from "@/engine/piano/progressCanvasDraw";
import { getRecommendedProgressCanvasHeightPx } from "@/engine/piano/progressCanvasSizing";
import { attachProgressCanvasSeek, type ProgressRollApi } from "@/engine/piano/pianoProgressSeek";
import { renderScorePlaylist } from "@/engine/piano/pianoPlaylist";
import { ScorePlayback, type ScorePlaybackHost } from "@/engine/piano/pianoScorePlayback";
import { ScoreLibrary } from "@/engine/piano/scoreLibrary";
import type { VoiceSource } from "@/engine/piano/types";

export class PianoApp {
  private readonly dom: ResolvedPianoDom;

  private readonly audio = new PianoAudio(() => this.masterVolume);
  private readonly scores = new ScoreLibrary(MIN_MIDI, MAX_MIDI);
  private readonly playback = new ScorePlayback();

  private scoreHost?: ScorePlaybackHost;
  private progressSeekDispose: (() => void) | null = null;

  private keyElements = new Map<number, HTMLButtonElement>();
  private readonly pressedKeyCodes = new Set<string>();
  private pointerPressEpoch = new Map<number, number>();
  private keyboardBaseMidi = 48;
  private masterVolume = 0.7;
  private playbackMode: "melody" | "raw" = "raw";
  private selectedScoreIndex = 0;
  private progressRafId = 0;
  private isSeekingProgress = false;
  private seekPreviewBeat: number | null = null;
  private hoverBeat: number | null = null;
  private hoverX = 0;
  private hoverY = 0;
  private gridDensityIndex = 0;
  private seekQuantizeModeIndex = 1;
  private progressViewStartBeat = 0;
  private autoFollowPlayhead = true;
  private isPanningProgress = false;
  private panStartClientX = 0;
  private panStartViewBeat = 0;
  private disposed = false;
  private readonly domEventsAbort = new AbortController();
  private tempoRescheduleRafId = 0;
  /** 卷帘容器宽度，ResizeObserver 更新，绘制时不再每帧读布局 */
  private progressPaintW = 0;
  private progressResizeObserver: ResizeObserver | null = null;

  constructor(dom: ResolvedPianoDom) {
    this.dom = dom;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.dom.bootLoadingOverlay.classList.add("hidden");
    this.dom.bootLoadingOverlay.setAttribute("aria-busy", "false");
    this.dom.bootLoadingPercent.textContent = "0%";
    if (this.tempoRescheduleRafId) {
      window.cancelAnimationFrame(this.tempoRescheduleRafId);
      this.tempoRescheduleRafId = 0;
    }
    this.progressResizeObserver?.disconnect();
    this.progressResizeObserver = null;
    this.domEventsAbort.abort();
    if (this.scoreHost) {
      this.playback.stopScore(this.scoreHost, false);
    }
    this.dom.piano.replaceChildren();
    this.keyElements.clear();
    window.removeEventListener("keydown", this.onKeyDownBound);
    window.removeEventListener("keyup", this.onKeyUpBound);
    window.removeEventListener("resize", this.onResizeBound);
    this.progressSeekDispose?.();
    this.progressSeekDispose = null;
    this.stopProgressLoop();
  }

  private setStatus(text: string) {
    this.dom.status.textContent = text;
    this.dom.statusBadge.textContent = text;
  }

  private setEngineBadge(text: string) {
    this.dom.engineBadge.textContent = text;
  }

  private updateTempoBadge() {
    this.dom.tempoBadge.textContent = `速度 ${this.dom.tempoScale.value}%`;
  }

  private updateModeTabsUI() {
    const slateActive = ["bg-slate-100", "text-slate-900", "shadow"];
    const activeClass = [
      "border",
      "border-cyan-400/60",
      "bg-cyan-950/80",
      "text-cyan-50",
      "shadow-[0_0_12px_rgba(34,211,238,0.25)]"
    ];
    const inactiveClass = ["border-transparent", "text-slate-400"];
    const strip = [...slateActive, ...activeClass, ...inactiveClass];
    this.dom.modeTabRaw.classList.remove(...strip);
    this.dom.modeTabRaw.classList.add(...(this.playbackMode === "raw" ? activeClass : inactiveClass));
    this.dom.modeTabMelody.classList.remove(...strip);
    this.dom.modeTabMelody.classList.add(...(this.playbackMode === "melody" ? activeClass : inactiveClass));
  }

  private activateKey(midi: number, active: boolean) {
    setKeyActive(this.keyElements, midi, active);
  }

  private startNote(midi: number, source: VoiceSource = "manual", durationSeconds: number | null = null, velocity = 100) {
    this.audio.startNote(midi, source, durationSeconds, velocity, (m, a) => this.activateKey(m, a));
  }

  private stopNote(midi: number, source: VoiceSource = "manual", expectedVoiceId: number | null = null) {
    this.audio.stopNote(midi, source, expectedVoiceId, (m, a) => this.activateKey(m, a));
  }

  private stopAllNotes() {
    this.audio.stopAllNotes((m, a) => this.activateKey(m, a));
  }

  private async handlePianoPointerDown(midi: number) {
    const epoch = (this.pointerPressEpoch.get(midi) ?? 0) + 1;
    this.pointerPressEpoch.set(midi, epoch);
    await this.audio.primeAudioEngines();
    if ((this.pointerPressEpoch.get(midi) ?? 0) !== epoch) return;
    this.startNote(midi, "pointer");
  }

  private handlePianoPointerUp(midi: number) {
    this.pointerPressEpoch.set(midi, (this.pointerPressEpoch.get(midi) ?? 0) + 1);
    this.stopNote(midi, "pointer");
  }

  private getSelectedScore() {
    const list = this.scores.loadedScores;
    if (list.length === 0) return null;
    const idx = Math.min(Math.max(0, this.selectedScoreIndex), list.length - 1);
    return list[idx];
  }

  private getViewScoreForRoll(): PlayableScore | null {
    const selected = this.getSelectedScore();
    if (!selected) return null;
    const sameAsCurrent =
      (this.playback.isPlayingScore || this.playback.isPausedScore) &&
      this.playback.currentScoreRef === selected &&
      this.playback.currentPlayableScore;
    if (sameAsCurrent) {
      return this.playback.currentPlayableScore;
    }
    return toPlayableScore(selected, noteNameToMidi);
  }

  private updatePauseButtonState() {
    const btn = this.dom.playPauseBtn;
    if (this.playback.isPlayingScore) {
      btn.textContent = "暂停";
      btn.setAttribute("aria-pressed", "true");
      btn.dataset.state = "playing";
    } else if (this.playback.isPausedScore) {
      btn.textContent = "继续";
      btn.setAttribute("aria-pressed", "mixed");
      btn.dataset.state = "paused";
    } else {
      btn.textContent = "播放";
      btn.removeAttribute("aria-pressed");
      btn.dataset.state = "idle";
    }
    btn.disabled = false;
  }

  private updatePianoRollBadges() {
    this.dom.gridBadge.textContent = `网格 ${getGridDensityLabel(this.gridDensityIndex)}`;
    this.dom.quantizeBadge.textContent = `吸附 ${getSeekQuantizeMode(this.seekQuantizeModeIndex).label.replace("吸附", "").trim()}`;
  }

  private cycleGridDensity() {
    this.gridDensityIndex = (this.gridDensityIndex + 1) % PIANO_ROLL_GRID_STEPS.length;
    this.updatePianoRollBadges();
    const gridLabel = getGridDensityLabel(this.gridDensityIndex);
    this.setStatus(`Piano Roll 网格：${gridLabel}`);
    this.drawProgressCanvas();
  }

  private cycleSeekQuantizeMode() {
    this.seekQuantizeModeIndex = (this.seekQuantizeModeIndex + 1) % SEEK_QUANTIZE_MODES.length;
    this.updatePianoRollBadges();
    this.setStatus(`Piano Roll 吸附：${getSeekQuantizeMode(this.seekQuantizeModeIndex).label}`);
    this.drawProgressCanvas();
  }

  /** 画布高度由引擎直接写 DOM，避免 React setState 与播放帧竞争导致布局抖动。 */
  private syncProgressCanvasCssSize() {
    const h = getRecommendedProgressCanvasHeightPx(this.getViewScoreForRoll());
    const el = this.dom.progressCanvas;
    const px = `${h}px`;
    if (el.style.height !== px) {
      el.style.height = px;
    }
  }

  private setupProgressCanvasResizeObserver() {
    const wrap = this.dom.progressCanvas.parentElement;
    if (!wrap) return;
    const applyWidth = (raw: number) => {
      if (raw <= 0) return;
      const next = Math.max(280, Math.floor(raw));
      if (next === this.progressPaintW) return;
      this.progressPaintW = next;
      this.drawProgressCanvas();
    };
    applyWidth(wrap.clientWidth);
    this.progressResizeObserver = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      applyWidth(cr ? cr.width : wrap.clientWidth);
    });
    this.progressResizeObserver.observe(wrap);
  }

  drawProgressCanvas() {
    this.syncProgressCanvasCssSize();
    const viewScore = this.getViewScoreForRoll();
    const paintH = getRecommendedProgressCanvasHeightPx(viewScore);
    const result = drawPianoRollFrame({
      progressCanvasEl: this.dom.progressCanvas,
      paintWidth: this.progressPaintW > 0 ? this.progressPaintW : undefined,
      paintHeight: paintH,
      viewScore,
      isPlayingScore: this.playback.isPlayingScore,
      isPausedScore: this.playback.isPausedScore,
      isSeekingProgress: this.isSeekingProgress,
      seekPreviewBeat: this.seekPreviewBeat,
      playbackStartBeat: this.playback.playbackStartBeat,
      getPlaybackBeatNow: () => this.playback.getPlaybackBeatNow(),
      gridDensityIndex: this.gridDensityIndex,
      seekQuantizeModeIndex: this.seekQuantizeModeIndex,
      hoverBeat: this.hoverBeat,
      hoverX: this.hoverX,
      hoverY: this.hoverY,
      playbackSecPerBeat: this.playback.playbackSecPerBeat,
      progressViewStartBeat: this.progressViewStartBeat,
      autoFollowPlayhead: this.autoFollowPlayhead
    });
    if (result) {
      this.progressViewStartBeat = result.progressViewStartBeat;
    }
  }

  private seekToBeat(beat: number) {
    const baseScore = this.playback.currentScoreRef || this.getSelectedScore();
    if (!baseScore) return;
    const playable = this.playback.currentPlayableScore || toPlayableScore(baseScore, noteNameToMidi);
    const maxBeat = Math.max(1, ...playable.events.map((e) => e.beat + e.duration));
    const targetBeat = Math.max(0, Math.min(maxBeat, beat));

    if (this.playback.isPlayingScore) {
      this.playback.scheduleScorePlayback(this.scoreHost!, playable, baseScore, targetBeat);
      return;
    }
    this.playback.playbackStartBeat = targetBeat;
    this.playback.currentScoreRef = baseScore;
    this.playback.currentPlayableScore = playable;
    this.setStatus(`定位到 ${targetBeat.toFixed(2)} 拍`);
    this.drawProgressCanvas();
  }

  private buildProgressRollApi(): ProgressRollApi {
    return {
      getViewScore: () => this.getViewScoreForRoll(),
      getSelectedScore: () => this.getSelectedScore(),
      getPlaybackBeatNow: () => this.playback.getPlaybackBeatNow(),
      getIsPlayingScore: () => this.playback.isPlayingScore,
      getIsPausedScore: () => this.playback.isPausedScore,
      getIsSeekingProgress: () => this.isSeekingProgress,
      setIsSeekingProgress: (v) => {
        this.isSeekingProgress = v;
      },
      getSeekPreviewBeat: () => this.seekPreviewBeat,
      setSeekPreviewBeat: (v) => {
        this.seekPreviewBeat = v;
      },
      getPlaybackStartBeat: () => this.playback.playbackStartBeat,
      getPlaybackSecPerBeat: () => this.playback.playbackSecPerBeat,
      getGridDensityIndex: () => this.gridDensityIndex,
      getSeekQuantizeModeIndex: () => this.seekQuantizeModeIndex,
      getHoverBeat: () => this.hoverBeat,
      setHoverBeat: (v) => {
        this.hoverBeat = v;
      },
      getHoverX: () => this.hoverX,
      setHoverX: (v) => {
        this.hoverX = v;
      },
      getHoverY: () => this.hoverY,
      setHoverY: (v) => {
        this.hoverY = v;
      },
      getProgressViewStartBeat: () => this.progressViewStartBeat,
      setProgressViewStartBeat: (v) => {
        this.progressViewStartBeat = v;
      },
      getAutoFollowPlayhead: () => this.autoFollowPlayhead,
      setAutoFollowPlayhead: (v) => {
        this.autoFollowPlayhead = v;
      },
      getIsPanningProgress: () => this.isPanningProgress,
      setIsPanningProgress: (v) => {
        this.isPanningProgress = v;
      },
      getPanStartClientX: () => this.panStartClientX,
      setPanStartClientX: (v) => {
        this.panStartClientX = v;
      },
      getPanStartViewBeat: () => this.panStartViewBeat,
      setPanStartViewBeat: (v) => {
        this.panStartViewBeat = v;
      },
      seekToBeat: (b) => this.seekToBeat(b),
      drawProgressCanvas: () => this.drawProgressCanvas(),
      cycleGridDensity: () => this.cycleGridDensity(),
      cycleSeekQuantizeMode: () => this.cycleSeekQuantizeMode()
    };
  }

  private stopProgressLoop() {
    if (this.progressRafId) {
      window.cancelAnimationFrame(this.progressRafId);
      this.progressRafId = 0;
    }
  }

  private startProgressLoop() {
    this.stopProgressLoop();
    const loop = () => {
      this.drawProgressCanvas();
      if (this.playback.isPlayingScore) {
        this.progressRafId = window.requestAnimationFrame(loop);
      } else {
        this.progressRafId = 0;
      }
    };
    this.progressRafId = window.requestAnimationFrame(loop);
  }

  private scheduleScorePlayback(playable: PlayableScore, sourceScore: PlayableScore, startBeat = 0) {
    this.playback.scheduleScorePlayback(this.scoreHost!, playable, sourceScore, startBeat);
  }

  private playScore(score: PlayableScore) {
    const playable = toPlayableScore(score, noteNameToMidi);
    this.scheduleScorePlayback(playable, score, 0);
  }

  /** 列表切换 / 导入后：若切换前正在播放，则在音频就绪后改播当前选中曲谱（从开头）。 */
  private queuePlaySelectedAfterPrimeWhenStillPlaying() {
    void this.audio.primeAudioEngines().then(() => {
      if (this.disposed) return;
      if (!this.playback.isPlayingScore) {
        this.drawProgressCanvas();
        return;
      }
      const sel = this.getSelectedScore();
      if (sel) {
        this.playScore(sel);
      }
    });
  }

  private pauseScore() {
    this.playback.pauseScore(this.scoreHost!);
  }

  private resumeScore() {
    this.playback.resumeScore(this.scoreHost!);
  }

  private stopScore(updateStatus = true) {
    this.autoFollowPlayhead = true;
    this.playback.stopScore(this.scoreHost!, updateStatus);
  }

  private renderScorePlaylist() {
    this.selectedScoreIndex = renderScorePlaylist({
      container: this.dom.scorePlaylist,
      scores: this.scores.loadedScores,
      selectedIndex: this.selectedScoreIndex,
      onSelectIndex: (idx) => {
        if (this.selectedScoreIndex === idx) return;
        const wasPlaying = this.playback.isPlayingScore;
        this.selectedScoreIndex = idx;
        this.renderScorePlaylist();
        if (wasPlaying) {
          this.queuePlaySelectedAfterPrimeWhenStillPlaying();
          return;
        }
        if (!this.playback.isPausedScore) {
          this.drawProgressCanvas();
        }
      }
    });
  }

  private onKeyDown(event: KeyboardEvent) {
    if (event.repeat) return;
    if (event.code === "BracketLeft") {
      this.keyboardBaseMidi = Math.max(MIN_MIDI, this.keyboardBaseMidi - 12);
      this.dom.keyboardBase.value = String(this.keyboardBaseMidi);
      this.syncKeyboardBaseUi();
      this.setStatus(`键盘音区：${midiToNoteName(this.keyboardBaseMidi)} 起`);
      return;
    }
    if (event.code === "BracketRight") {
      this.keyboardBaseMidi = Math.min(MAX_MIDI - 24, this.keyboardBaseMidi + 12);
      this.dom.keyboardBase.value = String(this.keyboardBaseMidi);
      this.syncKeyboardBaseUi();
      this.setStatus(`键盘音区：${midiToNoteName(this.keyboardBaseMidi)} 起`);
      return;
    }

    const offset = KEYBOARD_MAP.get(event.code);
    if (typeof offset !== "number") return;
    const midi = this.keyboardBaseMidi + offset;
    if (midi > MAX_MIDI || midi < MIN_MIDI) return;
    if (this.pressedKeyCodes.has(event.code)) return;

    void this.audio.primeAudioEngines();
    this.pressedKeyCodes.add(event.code);
    this.startNote(midi, "manual");
  }

  private onKeyUp(event: KeyboardEvent) {
    const offset = KEYBOARD_MAP.get(event.code);
    if (typeof offset !== "number") return;
    const midi = this.keyboardBaseMidi + offset;
    this.pressedKeyCodes.delete(event.code);
    this.stopNote(midi, "manual");
  }

  private setupEvents() {
    const sig = { signal: this.domEventsAbort.signal };
    window.addEventListener("keydown", this.onKeyDownBound, sig);
    window.addEventListener("keyup", this.onKeyUpBound, sig);

    this.dom.volume.addEventListener("input", () => {
      this.masterVolume = Number(this.dom.volume.value) / 100;
      this.dom.volumeValue.textContent = `${this.dom.volume.value}%`;
      this.audio.setLiveMasterLevel(this.masterVolume);
    }, sig);
    this.dom.keyboardBase.addEventListener("change", () => {
      this.keyboardBaseMidi = Number(this.dom.keyboardBase.value);
      this.syncKeyboardBaseUi();
      this.setStatus(`键盘音区：${midiToNoteName(this.keyboardBaseMidi)} 起`);
    }, sig);
    this.dom.tempoScale.addEventListener("input", () => {
      this.dom.tempoScaleValue.textContent = `${this.dom.tempoScale.value}%`;
      this.updateTempoBadge();
      if (!this.playback.isPlayingScore || !this.scoreHost || !this.playback.currentPlayableScore || !this.playback.currentScoreRef) {
        return;
      }
      if (this.tempoRescheduleRafId) {
        window.cancelAnimationFrame(this.tempoRescheduleRafId);
      }
      this.tempoRescheduleRafId = window.requestAnimationFrame(() => {
        this.tempoRescheduleRafId = 0;
        if (!this.playback.isPlayingScore || !this.scoreHost || !this.playback.currentPlayableScore || !this.playback.currentScoreRef) {
          return;
        }
        const beat = this.playback.getPlaybackBeatNow();
        this.playback.scheduleScorePlayback(
          this.scoreHost,
          this.playback.currentPlayableScore,
          this.playback.currentScoreRef,
          beat
        );
      });
    }, sig);
    this.dom.playbackMode.addEventListener("change", () => {
      this.playbackMode = this.dom.playbackMode.value as "melody" | "raw";
      this.updateModeTabsUI();
      this.scores.rebuildLoadedScores(this.playbackMode);
      this.renderScorePlaylist();
      this.stopScore(false);
      this.setStatus(
        this.playbackMode === "melody" ? "播放模式：旋律（每拍最高音）" : "播放模式：原始（多轨 / 卷帘分轨）"
      );
    }, sig);
    this.dom.modeTabRaw.addEventListener("click", () => {
      this.dom.playbackMode.value = "raw";
      this.dom.playbackMode.dispatchEvent(new Event("change"));
    }, sig);
    this.dom.modeTabMelody.addEventListener("click", () => {
      this.dom.playbackMode.value = "melody";
      this.dom.playbackMode.dispatchEvent(new Event("change"));
    }, sig);
    this.dom.gridBadge.title = "点击切换网格密度（1/4、1/8、1/16）";
    this.dom.gridBadge.addEventListener("click", () => this.cycleGridDensity(), sig);
    this.dom.quantizeBadge.title = "点击切换吸附模式（关闭、按拍、按小节）";
    this.dom.quantizeBadge.addEventListener("click", () => this.cycleSeekQuantizeMode(), sig);

    this.dom.playPauseBtn.addEventListener("click", async () => {
      await this.audio.primeAudioEngines();
      const selected = this.getSelectedScore();
      if (!selected) {
        this.setStatus("当前无可播放曲谱");
        return;
      }
      if (this.playback.isPlayingScore) {
        this.pauseScore();
        return;
      }
      if (this.playback.isPausedScore) {
        if (selected === this.playback.currentScoreRef) {
          this.resumeScore();
        } else {
          this.playScore(selected);
        }
        return;
      }
      this.playScore(selected);
    }, sig);

    this.dom.stopBtn.addEventListener("click", () => {
      this.stopScore(true);
    }, sig);

    this.dom.scoreFile.addEventListener("change", async () => {
      const file = this.dom.scoreFile.files?.[0];
      if (!file) return;
      try {
        let importedScore: PlayableScore;
        if (isMidiUpload(file)) {
          const arrayBuffer = await file.arrayBuffer();
          const parsedMidi = parseMidi(arrayBuffer);
          importedScore = midiToScore(parsedMidi, toImportedMidiTitle(file.name), this.playbackMode, MIN_MIDI, MAX_MIDI);
        } else {
          const text = await file.text();
          const parsed = JSON.parse(text);
          importedScore = normalizeScore(parsed, noteNameToMidi);
        }
        this.scores.importedScores.push(importedScore);
        this.scores.rebuildLoadedScores(this.playbackMode);
        const wasPlaying = this.playback.isPlayingScore;
        this.selectedScoreIndex = this.scores.loadedScores.length - 1;
        this.renderScorePlaylist();
        this.setStatus(`导入成功：${importedScore.title}`);
        if (wasPlaying) {
          this.queuePlaySelectedAfterPrimeWhenStillPlaying();
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.setStatus(`导入失败：${msg}`);
      } finally {
        this.dom.scoreFile.value = "";
      }
    }, sig);
  }

  private populateKeyboardBase() {
    this.dom.keyboardBase.replaceChildren();
    for (let octave = 0; octave <= 6; octave += 1) {
      const midi = 12 * (octave + 1);
      if (midi < MIN_MIDI || midi > MAX_MIDI - 24) continue;
      const opt = document.createElement("option");
      opt.value = String(midi);
      opt.textContent = `C${octave} - B${octave + 1}`;
      this.dom.keyboardBase.appendChild(opt);
    }
    this.dom.keyboardBase.value = String(this.keyboardBaseMidi);
    this.syncKeyboardBaseUi();
  }

  private syncKeyboardBaseUi() {
    const sel = this.dom.keyboardBase;
    const list = this.dom.keyboardBaseList;
    list.innerHTML = "";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "键盘音区");
    for (let i = 0; i < sel.options.length; i += 1) {
      const opt = sel.options[i];
      const val = opt.value;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", sel.value === val ? "true" : "false");
      btn.className = [
        "flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm transition-colors",
        sel.value === val
          ? "border border-cyan-400/50 bg-cyan-950/90 text-cyan-50 shadow-[0_0_10px_rgba(34,211,238,0.2)]"
          : "border border-transparent text-cyan-100/80 hover:border-cyan-500/25 hover:bg-slate-900/90"
      ].join(" ");
      btn.textContent = opt.textContent || "";
      btn.addEventListener("click", () => {
        sel.value = val;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      });
      list.appendChild(btn);
    }
  }

  private onKeyDownBound = (e: KeyboardEvent) => this.onKeyDown(e);
  private onKeyUpBound = (e: KeyboardEvent) => this.onKeyUp(e);
  private onResizeBound = () => {
    this.drawProgressCanvas();
    layoutPianoKeys(this.dom.piano, this.keyElements);
  };

  async initialize() {
    const ov = this.dom.bootLoadingOverlay;
    this.dom.bootLoadingPercent.textContent = "0%";
    ov.classList.remove("hidden");
    ov.setAttribute("aria-busy", "true");
    try {
      await this.initializeCore();
    } finally {
      ov.classList.add("hidden");
      ov.setAttribute("aria-busy", "false");
    }
  }

  private async initializeCore() {
    this.scoreHost = {
      audio: this.audio,
      getTempoScaleFactor: () => Number(this.dom.tempoScale.value) / 100,
      setStatus: (text) => this.setStatus(text),
      setEngineBadge: (text) => this.setEngineBadge(text),
      startNote: (midi, source, dur, vel) => this.startNote(midi, source, dur, vel),
      stopAllNotes: () => this.stopAllNotes(),
      drawProgressCanvas: () => this.drawProgressCanvas(),
      updatePauseButtonState: () => this.updatePauseButtonState(),
      startProgressLoop: () => this.startProgressLoop(),
      stopProgressLoop: () => this.stopProgressLoop(),
      ensureAudioContext: () => {
        this.audio.ensureAudioContext();
      },
      onWillStartPlayback: () => {
        this.autoFollowPlayhead = true;
      }
    };

    this.dom.playbackMode.value = this.playbackMode;

    const waitRaf = () =>
      new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
      });

    /** 与曲谱加载并行；全屏 loading 结束前会 await，避免首播仍走合成器。 */
    const samplesReady = (async () => {
      await waitRaf();
      if (this.disposed) return false;
      this.audio.ensureAudioContext();
      await startToneWithinMs(500);
      if (this.disposed) return false;
      const reportSamplePct = (v: number | string) => {
        if (this.disposed) return;
        this.dom.bootLoadingPercent.textContent = typeof v === "number" ? `${v}%` : v;
      };
      return this.audio.ensureSamplePiano(reportSamplePct);
    })();

    await waitRaf();
    if (this.disposed) return;
    try {
      const syncFailed = await this.scores.loadBuiltinMidiScores(this.playbackMode, {
        onBatch: () => {
          if (this.disposed) return;
          this.renderScorePlaylist();
          this.drawProgressCanvas();
        },
        onComplete: (asyncFailed) => {
          if (this.disposed) return;
          this.renderScorePlaylist();
          this.drawProgressCanvas();
          if (asyncFailed.length > 0) {
            this.setStatus(`部分内置曲谱加载失败：${asyncFailed.join("、")}`);
          }
        }
      });
      if (this.scores.loadedScores.length === 0) {
        throw new Error(`全部加载失败：${syncFailed.join("、")}`);
      }
      if (syncFailed.length > 0) {
        this.setStatus(`部分内置曲谱加载失败：${syncFailed.join("、")}`);
      } else {
        this.setStatus("已加载内置 MIDI 曲谱");
      }
    } catch (error) {
      this.scores.usingFallbackScores = true;
      this.scores.rebuildLoadedScores(this.playbackMode);
      const msg = error instanceof Error ? error.message : String(error);
      this.setStatus(`内置曲谱加载失败：${msg}（建议使用本地静态服务器打开）`);
    }
    if (this.disposed) return;

    this.keyElements = createPianoKeys(this.dom.piano, (midi) => this.handlePianoPointerDown(midi), (midi) =>
      this.handlePianoPointerUp(midi)
    );
    layoutPianoKeys(this.dom.piano, this.keyElements);

    this.populateKeyboardBase();
    this.renderScorePlaylist();

    const sampleOk = await samplesReady;
    if (this.disposed) return;
    this.setEngineBadge(
      sampleOk && this.audio.samplePianoEnabled && this.audio.hasToneSampler() ? "采样音色" : "合成音色"
    );

    this.setupEvents();
    this.setupProgressCanvasResizeObserver();
    this.progressSeekDispose = attachProgressCanvasSeek(this.dom.progressCanvas, this.buildProgressRollApi());
    this.updateTempoBadge();
    this.updateModeTabsUI();
    this.updatePianoRollBadges();
    this.updatePauseButtonState();
    this.drawProgressCanvas();
    window.addEventListener("resize", this.onResizeBound, { signal: this.domEventsAbort.signal });
  }
}
