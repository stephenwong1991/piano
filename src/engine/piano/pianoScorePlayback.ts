import { toPlayableScore, type PlayableScore } from "@/engine/midi/midi";
import { noteNameToMidi } from "@/engine/piano/noteUtils";
import type { VoiceSource } from "@/engine/piano/types";

export interface ScorePlaybackHost {
  getTempoScaleFactor(): number;
  setStatus(text: string): void;
  setEngineBadge(text: string): void;
  startNote(
    midi: number,
    source: VoiceSource,
    durationSeconds: number | null,
    velocity: number,
    /** 键位亮灯秒数（谱面时值）；见 PianoAudio.startNote */
    scoreKeyHighlightSeconds?: number | null
  ): void;
  stopAllNotes(): void;
  drawProgressCanvas(): void;
  updatePauseButtonState(): void;
  startProgressLoop(): void;
  stopProgressLoop(): void;
  ensureAudioContext(): void;
  /** 每次开始/恢复按时间轴播放时调用（例如恢复跟拍滚动） */
  onWillStartPlayback(): void;
  readonly audio: { samplePianoEnabled: boolean; hasToneSampler: () => boolean };
}

export class ScorePlayback {
  private stopTimers: number[] = [];
  isPlayingScore = false;
  isPausedScore = false;
  currentScoreRef: PlayableScore | null = null;
  currentPlayableScore: PlayableScore | null = null;
  playbackStartBeat = 0;
  playbackSecPerBeat = 0;
  playbackMaxBeat = 0;
  playbackStartMs = 0;

  getPlaybackBeatNow(): number {
    if (!this.isPlayingScore || this.playbackSecPerBeat <= 0) {
      return this.playbackStartBeat;
    }
    const elapsedSec = (window.performance.now() - this.playbackStartMs) / 1000;
    const progressedBeat = this.playbackStartBeat + elapsedSec / this.playbackSecPerBeat;
    return Math.min(this.playbackMaxBeat, Math.max(0, progressedBeat));
  }

  clearTimers() {
    this.stopTimers.forEach((id) => window.clearTimeout(id));
    this.stopTimers = [];
  }

  scheduleScorePlayback(host: ScorePlaybackHost, playable: PlayableScore, sourceScore: PlayableScore, startBeat = 0) {
    host.onWillStartPlayback();
    host.stopAllNotes();
    this.clearTimers();
    host.ensureAudioContext();
    if (!playable || !Array.isArray(playable.events) || playable.events.length === 0) {
      host.setStatus("当前曲谱无可播放音符");
      host.drawProgressCanvas();
      return;
    }

    const tempoScale = host.getTempoScaleFactor();
    const finalTempo = playable.tempo * tempoScale;
    const secPerBeat = 60 / finalTempo;
    const maxBeat = Math.max(...playable.events.map((e) => e.beat + e.duration));
    this.currentScoreRef = sourceScore;
    this.currentPlayableScore = playable;
    this.playbackSecPerBeat = secPerBeat;
    this.playbackMaxBeat = maxBeat;
    this.playbackStartBeat = Math.max(0, Math.min(startBeat, maxBeat));
    this.playbackStartMs = window.performance.now();
    this.isPlayingScore = true;
    this.isPausedScore = false;
    host.updatePauseButtonState();
    const engineLabel = host.audio.samplePianoEnabled && host.audio.hasToneSampler() ? "采样音色" : "合成音色";
    host.setEngineBadge(engineLabel);
    host.setStatus(`正在播放：${playable.title}（${Math.round(finalTempo)} BPM，${engineLabel}）`);

    playable.events.forEach((event) => {
      const overlapBeat = this.playbackStartBeat - event.beat;
      const remainingBeat = event.duration - Math.max(0, overlapBeat);
      if (remainingBeat <= 0) return;
      const visBeats = event.durationVisual ?? event.duration;
      const remainingVisualBeat = visBeats - Math.max(0, overlapBeat);
      const startMs = Math.max(0, event.beat - this.playbackStartBeat) * secPerBeat * 1000;
      const durSec = remainingBeat * secPerBeat;
      let scoreKeyHighlightSeconds: number | undefined;
      if (remainingVisualBeat <= 0) {
        scoreKeyHighlightSeconds = 0;
      } else {
        const kSec = remainingVisualBeat * secPerBeat;
        if (event.durationVisual != null && durSec > kSec + 1e-5) {
          scoreKeyHighlightSeconds = kSec;
        }
      }
      const timer = window.setTimeout(() => {
        if (!this.isPlayingScore) return;
        event.midiList.forEach((midi) =>
          host.startNote(midi, "score", durSec, event.velocity || 100, scoreKeyHighlightSeconds)
        );
      }, startMs);
      this.stopTimers.push(timer);
    });

    const remainBeat = Math.max(0, maxBeat - this.playbackStartBeat);
    const endTimer = window.setTimeout(() => {
      this.stopScore(host, false);
      host.setStatus(`播放结束：${playable.title}`);
    }, remainBeat * secPerBeat * 1000 + 220);
    this.stopTimers.push(endTimer);
    host.startProgressLoop();
  }

  playScore(host: ScorePlaybackHost, score: PlayableScore) {
    const playable = toPlayableScore(score, noteNameToMidi);
    this.scheduleScorePlayback(host, playable, score, 0);
  }

  pauseScore(host: ScorePlaybackHost) {
    if (!this.isPlayingScore) return;
    this.playbackStartBeat = this.getPlaybackBeatNow();
    this.isPlayingScore = false;
    this.isPausedScore = true;
    this.clearTimers();
    host.stopAllNotes();
    host.stopProgressLoop();
    host.drawProgressCanvas();
    host.updatePauseButtonState();
    host.setStatus(`已暂停：${this.currentPlayableScore ? this.currentPlayableScore.title : "当前曲谱"}`);
  }

  resumeScore(host: ScorePlaybackHost) {
    if (!this.isPausedScore || !this.currentPlayableScore) return;
    this.scheduleScorePlayback(host, this.currentPlayableScore, this.currentScoreRef || this.currentPlayableScore, this.playbackStartBeat);
  }

  stopScore(host: ScorePlaybackHost, updateStatus = true) {
    this.isPlayingScore = false;
    this.isPausedScore = false;
    this.playbackStartBeat = 0;
    this.currentPlayableScore = null;
    this.currentScoreRef = null;
    this.clearTimers();
    host.stopAllNotes();
    host.stopProgressLoop();
    host.drawProgressCanvas();
    host.updatePauseButtonState();
    if (updateStatus) {
      host.setStatus("已停止");
    }
  }
}
