import { createImpulseResponse, getNoiseBuffer } from "@/engine/audio/audioUtils";
import { getSampleLoadPlan } from "@/engine/piano/builtinAssets";
import { sliceAudioBufferRegion } from "@/engine/piano/sampleSpriteSlice";
import { midiToFrequency, midiToNoteName } from "@/engine/piano/noteUtils";
import type { ActiveVoice, VoiceSource } from "@/engine/piano/types";

const MIN_MIDI = 21;
const MAX_MIDI = 108;

/**
 * 无用户手势时 `AudioContext.resume()` 的 Promise 可能长期不 resolve（既不 reject），
 * 若在首屏 await 会永远卡在 loading。用超时兜底后仍可继续加载 Tone.Buffer / Sampler。
 */
export async function startToneWithinMs(timeoutMs = 500): Promise<void> {
  const Tone = window.Tone as { start?: () => void | Promise<void> } | undefined;
  if (!Tone || typeof Tone.start !== "function") return;
  await Promise.race([
    Promise.resolve(Tone.start()).catch(() => {}),
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, timeoutMs);
    })
  ]);
}

/** 用户已点击播放/琴键：给 Tone / AudioContext 更长时间 resume，避免 triggerAttack 失败退回合成器。 */
async function startToneAfterUserGesture(maxMs = 8000): Promise<void> {
  const Tone = window.Tone as { start?: () => void | Promise<void> } | undefined;
  if (!Tone || typeof Tone.start !== "function") return;
  await Promise.race([
    Promise.resolve(Tone.start()).catch(() => {}),
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, maxMs);
    })
  ]);
}

/** 多路 MP3 + 慢网时 12s 内未 onload 会误判失败并关 loading，随后 onload 才到 → 先合成器后采样。 */
const SAMPLER_LOAD_TIMEOUT_MS = 120_000;

function getToneBufferLoad():
  | ((url: string) => Promise<AudioBuffer>)
  | undefined {
  const Tone = window.Tone as { ToneAudioBuffer?: { load?: (url: string) => Promise<AudioBuffer> } } | undefined;
  const load = Tone?.ToneAudioBuffer?.load;
  return typeof load === "function" ? load : undefined;
}

function getToneRawAudioContext(): AudioContext | undefined {
  const Tone = window.Tone as { getContext?: () => { rawContext?: AudioContext } } | undefined;
  return Tone?.getContext?.()?.rawContext;
}

/**
 * Sprite 单文件：用 fetch 流式读取以便在有 Content-Length 时显示真实下载比例；
 * 解码阶段无细分进度，用文案提示。
 */
async function fetchAndDecodeSpriteMp3(
  url: string,
  onSampleLoadProgress?: (value: number | string) => void
): Promise<AudioBuffer> {
  const ctx = getToneRawAudioContext();
  if (!ctx) {
    const load = getToneBufferLoad();
    if (!load) throw new Error("Tone 上下文未就绪");
    onSampleLoadProgress?.("加载采样…");
    return load(url);
  }

  onSampleLoadProgress?.("下载采样…");
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`采样请求失败：${res.status}`);
  }
  const total = Number(res.headers.get("content-length") || 0);
  const reader = res.body?.getReader();
  let buffer: ArrayBuffer;

  if (reader) {
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.length) {
        chunks.push(value);
        received += value.length;
        if (total > 0) {
          onSampleLoadProgress?.(Math.min(88, Math.round((received / total) * 88)));
        }
      }
    }
    const merged = new Uint8Array(received);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    buffer = merged.buffer;
  } else {
    buffer = await res.arrayBuffer();
    if (total > 0) {
      onSampleLoadProgress?.(88);
    } else {
      onSampleLoadProgress?.("下载采样…");
    }
  }

  onSampleLoadProgress?.("解码音频…");
  return ctx.decodeAudioData(buffer.slice(0));
}

/** 多文件：按完成个数给 0–100；sprite：下载百分比或阶段文案 */
type SampleLoadProgressValue = number | string;

export class PianoAudio {
  private audioContext?: AudioContext;
  private masterGainNode?: GainNode;
  private dryGainNode?: GainNode;
  private wetGainNode?: GainNode;
  private compressorNode?: DynamicsCompressorNode;
  private reverbNode?: ConvolverNode;
  private toneSampler: { triggerAttack: (note: string, time?: number, velocity?: number) => void; triggerRelease: (note: string, time?: number) => void; toDestination: () => void } | null = null;
  private toneSamplerReadyPromise: Promise<boolean> | null = null;
  samplePianoEnabled = false;
  private readonly activeVoices = new Map<number, ActiveVoice>();
  private voiceIdCounter = 1;
  /** 键盘/鼠标仍按住的音（与延音踏板配合：抬键后若踏板踩着则不触发 release） */
  private readonly physicalKeysDown = new Set<number>();
  private sustainPedalDown = false;
  /** 每个 MIDI 键上待触发的 note-off 定时器（须与 stopAllNotes / 替换声部时一并清理，避免琴键状态错乱） */
  private readonly noteOffTimers = new Map<number, number>();
  /** 曲谱键位提前熄灭（与延音尾发声）用，与 note-off 独立 */
  private readonly keyHighlightTimers = new Map<number, number>();

  constructor(private getMasterVolume: () => number) {}

  private clearKeyHighlightTimer(midi: number) {
    const tid = this.keyHighlightTimers.get(midi);
    if (tid !== undefined) {
      window.clearTimeout(tid);
      this.keyHighlightTimers.delete(midi);
    }
  }

  /** 谱面「离键」时刻只关键位 UI，声音仍按延音继续 */
  private scheduleScoreKeyHighlightOff(
    midi: number,
    delaySec: number,
    onActivateKey: (midi: number, active: boolean) => void
  ) {
    this.clearKeyHighlightTimer(midi);
    const tid = window.setTimeout(() => {
      this.keyHighlightTimers.delete(midi);
      onActivateKey(midi, false);
    }, Math.max(0, delaySec * 1000));
    this.keyHighlightTimers.set(midi, tid);
  }

  private clearNoteOffTimer(midi: number) {
    const tid = this.noteOffTimers.get(midi);
    if (tid !== undefined) {
      window.clearTimeout(tid);
      this.noteOffTimers.delete(midi);
    }
  }

  private scheduleNoteOff(
    midi: number,
    source: VoiceSource,
    voiceId: number,
    durationSeconds: number,
    onActivateKey: (midi: number, active: boolean) => void
  ) {
    this.clearNoteOffTimer(midi);
    const tid = window.setTimeout(() => {
      this.noteOffTimers.delete(midi);
      this.stopNote(midi, source, voiceId, onActivateKey);
    }, Math.max(0, durationSeconds * 1000));
    this.noteOffTimers.set(midi, tid);
  }

  private setupAudioChain() {
    if (!this.audioContext) return;
    const audioContext = this.audioContext;
    this.masterGainNode = audioContext.createGain();
    this.masterGainNode.gain.value = 0.95;

    this.dryGainNode = audioContext.createGain();
    this.dryGainNode.gain.value = 0.85;
    this.wetGainNode = audioContext.createGain();
    this.wetGainNode.gain.value = 0.28;

    this.compressorNode = audioContext.createDynamicsCompressor();
    this.compressorNode.threshold.value = -20;
    this.compressorNode.knee.value = 18;
    this.compressorNode.ratio.value = 2.4;
    this.compressorNode.attack.value = 0.004;
    this.compressorNode.release.value = 0.22;

    this.reverbNode = audioContext.createConvolver();
    this.reverbNode.normalize = true;
    this.reverbNode.buffer = createImpulseResponse(audioContext);

    this.dryGainNode.connect(this.compressorNode);
    this.wetGainNode.connect(this.reverbNode);
    this.reverbNode.connect(this.compressorNode);
    this.compressorNode.connect(this.masterGainNode);
    this.masterGainNode.connect(audioContext.destination);
    this.setLiveMasterLevel(this.getMasterVolume());
  }

  ensureAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new window.AudioContext();
      this.setupAudioChain();
    }
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }
  }

  getAudioContext() {
    return this.audioContext;
  }

  async ensureSamplePiano(onSampleLoadProgress?: (value: SampleLoadProgressValue) => void) {
    if (this.toneSampler) return true;
    if (!window.Tone || typeof window.Tone.Sampler !== "function") {
      return false;
    }
    if (!this.toneSamplerReadyPromise) {
      const plan = getSampleLoadPlan();
      const noteKeys = plan.mode === "sprite" ? Object.keys(plan.cues) : Object.keys(plan.urls);
      if (!noteKeys.length) {
        this.samplePianoEnabled = false;
        this.toneSamplerReadyPromise = Promise.resolve(false);
      } else {
        const bufferLoad = getToneBufferLoad();
        if (!bufferLoad) {
          this.samplePianoEnabled = false;
          this.toneSamplerReadyPromise = Promise.resolve(false);
        } else {
          this.toneSamplerReadyPromise = new Promise<boolean>((resolve) => {
            let settled = false;
            const finish = (ok: boolean) => {
              if (settled) return;
              settled = true;
              resolve(ok);
            };

            const run = async () => {
              try {
                onSampleLoadProgress?.(0);

                const buffers: Record<string, AudioBuffer> = {};

                if (plan.mode === "sprite") {
                  const decoded = await fetchAndDecodeSpriteMp3(plan.url, onSampleLoadProgress);
                  onSampleLoadProgress?.("准备音色…");
                  for (const note of noteKeys) {
                    const cue = plan.cues[note];
                    buffers[note] = sliceAudioBufferRegion(decoded, cue.startSec, cue.durationSec);
                  }
                  onSampleLoadProgress?.(96);
                } else {
                  const total = noteKeys.length;
                  let completed = 0;
                  const bump = () => {
                    completed += 1;
                    onSampleLoadProgress?.(Math.min(100, Math.round((100 * completed) / total)));
                  };
                  await Promise.all(
                    noteKeys.map(async (note) => {
                      const url = plan.urls[note];
                      const buf = await bufferLoad(url);
                      buffers[note] = buf;
                      bump();
                    })
                  );
                }

                const sampler = new window.Tone.Sampler({
                  urls: buffers,
                  release: 2.2,
                  onload: () => {
                    sampler.toDestination();
                    this.toneSampler = sampler;
                    this.samplePianoEnabled = true;
                    onSampleLoadProgress?.(100);
                    finish(true);
                  },
                  onerror: () => {
                    this.samplePianoEnabled = false;
                    finish(false);
                  }
                });
                window.setTimeout(() => {
                  if (!this.toneSampler) {
                    this.samplePianoEnabled = false;
                    finish(false);
                  }
                }, SAMPLER_LOAD_TIMEOUT_MS);
              } catch (_) {
                this.samplePianoEnabled = false;
                finish(false);
              }
            };

            void run();
          });
        }
      }
    }

    await this.toneSamplerReadyPromise;
    /** 超时先 resolve(false) 后 onload 仍可能到达，以实例字段为准 */
    return Boolean(this.toneSampler);
  }

  async primeAudioEngines() {
    this.ensureAudioContext();
    await startToneAfterUserGesture();
    await this.ensureSamplePiano();
  }

  preloadSamplePiano() {
    void this.ensureSamplePiano();
  }

  hasToneSampler() {
    return Boolean(this.toneSampler);
  }

  private releaseVoice(voice: ActiveVoice) {
    if (!voice || voice.stopped) return;
    if (voice.engine === "sample") {
      voice.stopped = true;
      if (this.toneSampler) {
        try {
          this.toneSampler.triggerRelease(voice.noteName, window.Tone.now());
        } catch (_) {
          // 采样音符释放失败时忽略，避免影响其他音符。
        }
      }
      return;
    }
    voice.stopped = true;
    const now = this.audioContext ? this.audioContext.currentTime : 0;
    const releaseSeconds = typeof voice.releaseSeconds === "number" ? voice.releaseSeconds : 0.22;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(Math.max(voice.gain.gain.value, 0.0001), now);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + releaseSeconds);
    voice.oscillators.forEach(({ osc }) => {
      try {
        osc.stop(now + releaseSeconds + 0.04);
      } catch (_) {
        // 忽略重复 stop 的异常，避免中断播放流程。
      }
    });
  }

  startNote(
    midi: number,
    source: VoiceSource = "manual",
    durationSeconds: number | null = null,
    velocity = 100,
    onActivateKey: (midi: number, active: boolean) => void,
    /** 曲谱专用：键位亮灯时长（谱面「未延音」的剩余秒数）。`0` = 仅发声不亮键；不传则与整段发声同长（无踏板延长时） */
    scoreKeyHighlightSeconds?: number | null
  ) {
    if (midi < MIN_MIDI || midi > MAX_MIDI) {
      return;
    }
    this.ensureAudioContext();
    const audioContext = this.audioContext!;

    const existing = this.activeVoices.get(midi);
    if (existing) {
      if (source === "score") {
        if (existing.source === "score") {
          this.releaseVoice(existing);
          this.activeVoices.delete(midi);
        } else {
          return;
        }
      } else if (existing.source === "score") {
        return;
      } else {
        this.releaseVoice(existing);
        this.activeVoices.delete(midi);
      }
    }

    this.clearNoteOffTimer(midi);
    this.clearKeyHighlightTimer(midi);

    const now = audioContext.currentTime;
    const velocityNorm = Math.min(1, Math.max(0.15, Number(velocity) / 127));
    const suppressScoreKeyOn = source === "score" && scoreKeyHighlightSeconds === 0;
    const earlyKeyOffSec =
      source === "score" &&
      !suppressScoreKeyOn &&
      typeof scoreKeyHighlightSeconds === "number" &&
      scoreKeyHighlightSeconds > 0 &&
      durationSeconds != null &&
      durationSeconds > 0 &&
      scoreKeyHighlightSeconds < durationSeconds - 1e-6
        ? scoreKeyHighlightSeconds
        : null;

    if (this.samplePianoEnabled && this.toneSampler) {
      const noteName = midiToNoteName(midi);
      try {
        this.toneSampler.triggerAttack(noteName, window.Tone.now(), velocityNorm);
        const voiceId = this.voiceIdCounter++;
        this.activeVoices.set(midi, { id: voiceId, source, stopped: false, engine: "sample", noteName });
        if (source === "manual" || source === "pointer") {
          this.physicalKeysDown.add(midi);
        }
        if (!suppressScoreKeyOn) {
          onActivateKey(midi, true);
        }
        if (durationSeconds && durationSeconds > 0) {
          this.scheduleNoteOff(midi, source, voiceId, durationSeconds, onActivateKey);
        }
        if (earlyKeyOffSec != null) {
          this.scheduleScoreKeyHighlightOff(midi, earlyKeyOffSec, onActivateKey);
        }
        return;
      } catch (_) {
        // 采样触发失败时回退到合成器。
      }
    }

    const attackSeconds = 0.003 + (1 - velocityNorm) * 0.012;
    const peakGain = 0.2 + velocityNorm * 0.32;
    const sustainGain = peakGain * (0.32 + (1 - velocityNorm) * 0.12);
    const releaseSeconds = 0.2 + (1 - velocityNorm) * 0.16 + Math.max(0, (60 - midi) * 0.002);
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(peakGain, 0.0002), now + attackSeconds);
    gain.gain.exponentialRampToValueAtTime(Math.max(sustainGain, 0.00015), now + attackSeconds + 0.2);

    const lowpass = audioContext.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.Q.value = 0.85;
    const brightness = 1500 + velocityNorm * 3800 + (midi - 21) * 12;
    const filterStart = Math.min(8800, brightness);
    const filterSustain = Math.max(900, filterStart * 0.45);
    lowpass.frequency.setValueAtTime(filterStart, now);
    lowpass.frequency.exponentialRampToValueAtTime(filterSustain, now + 0.22);

    const harmonics = [
      { ratio: 1, amp: 1, type: "sawtooth" as OscillatorType, detune: -2 },
      { ratio: 2, amp: 0.2, type: "triangle" as OscillatorType, detune: 3 },
      { ratio: 3, amp: 0.08, type: "sine" as OscillatorType, detune: -4 }
    ];
    const oscillators = harmonics.map((harmonic) => {
      const osc = audioContext.createOscillator();
      const oscGain = audioContext.createGain();
      osc.type = harmonic.type;
      osc.frequency.setValueAtTime(midiToFrequency(midi) * harmonic.ratio, now);
      osc.detune.setValueAtTime(harmonic.detune, now);
      oscGain.gain.value = harmonic.amp;
      osc.connect(oscGain);
      oscGain.connect(lowpass);
      osc.start(now);
      return { osc, oscGain };
    });

    const hammerSource = audioContext.createBufferSource();
    hammerSource.buffer = getNoiseBuffer(audioContext);
    const hammerFilter = audioContext.createBiquadFilter();
    hammerFilter.type = "highpass";
    hammerFilter.frequency.setValueAtTime(1100 + velocityNorm * 700, now);
    const hammerGain = audioContext.createGain();
    hammerGain.gain.setValueAtTime(0.0001, now);
    hammerGain.gain.exponentialRampToValueAtTime(0.04 * velocityNorm, now + 0.002);
    hammerGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);
    hammerSource.connect(hammerFilter);
    hammerFilter.connect(lowpass);
    hammerSource.start(now);
    hammerSource.stop(now + 0.03);

    lowpass.connect(gain);
    const sendGain = audioContext.createGain();
    sendGain.gain.value = 0.18;
    gain.connect(this.dryGainNode!);
    gain.connect(sendGain);
    sendGain.connect(this.wetGainNode!);
    const voiceId = this.voiceIdCounter++;
    this.activeVoices.set(midi, { id: voiceId, gain, oscillators, source, stopped: false, releaseSeconds });
    if (source === "manual" || source === "pointer") {
      this.physicalKeysDown.add(midi);
    }
    if (!suppressScoreKeyOn) {
      onActivateKey(midi, true);
    }

    if (durationSeconds && durationSeconds > 0) {
      this.scheduleNoteOff(midi, source, voiceId, durationSeconds, onActivateKey);
    }
    if (earlyKeyOffSec != null) {
      this.scheduleScoreKeyHighlightOff(midi, earlyKeyOffSec, onActivateKey);
    }
  }

  stopNote(midi: number, source: VoiceSource = "manual", expectedVoiceId: number | null = null, onActivateKey?: (midi: number, active: boolean) => void) {
    const voice = this.activeVoices.get(midi);
    if (!voice) {
      this.clearNoteOffTimer(midi);
      this.clearKeyHighlightTimer(midi);
      if (onActivateKey) onActivateKey(midi, false);
      return;
    }
    if (expectedVoiceId !== null && voice.id !== expectedVoiceId) return;
    if (source === "manual" && voice.source === "score") return;
    this.clearNoteOffTimer(midi);
    this.clearKeyHighlightTimer(midi);
    this.releaseVoice(voice);
    this.activeVoices.delete(midi);
    if (onActivateKey) onActivateKey(midi, false);
  }

  /**
   * 手指/鼠标抬键：琴键视觉立即熄灭；若延音踏板踩着则声音继续，直到松踏板。
   */
  physicalKeyUp(midi: number, source: "manual" | "pointer", onKeyVisual: (midi: number, active: boolean) => void) {
    this.physicalKeysDown.delete(midi);
    onKeyVisual(midi, false);
    if (this.sustainPedalDown) {
      return;
    }
    this.stopNote(midi, source, null, undefined);
  }

  /**
   * 延音踏板（右踏板）：踩下时抬键不截断余音；松开时对所有「已抬键」的手动声部执行 release。
   */
  setSustainPedal(down: boolean, onReleaseVoices?: (midi: number, active: boolean) => void) {
    const wasDown = this.sustainPedalDown;
    this.sustainPedalDown = down;
    if (wasDown && !down && onReleaseVoices) {
      const toRelease: number[] = [];
      for (const [midi, voice] of this.activeVoices) {
        if (voice.source !== "manual" && voice.source !== "pointer") continue;
        if (this.physicalKeysDown.has(midi)) continue;
        toRelease.push(midi);
      }
      for (const midi of toRelease) {
        const voice = this.activeVoices.get(midi);
        if (!voice) continue;
        this.stopNote(midi, voice.source, null, onReleaseVoices);
      }
    }
  }

  stopAllNotes(onActivateKey: (midi: number, active: boolean) => void) {
    for (const tid of this.noteOffTimers.values()) {
      window.clearTimeout(tid);
    }
    this.noteOffTimers.clear();
    for (const tid of this.keyHighlightTimers.values()) {
      window.clearTimeout(tid);
    }
    this.keyHighlightTimers.clear();
    this.physicalKeysDown.clear();
    this.sustainPedalDown = false;
    const playing = Array.from(this.activeVoices.entries());
    playing.forEach(([midi, voice]) => {
      this.releaseVoice(voice);
      this.activeVoices.delete(midi);
      onActivateKey(midi, false);
    });
  }

  /**
   * 与主音量滑块同步：WebAudio 总线 + Tone Destination，播放过程中拖动即可听到变化。
   */
  setLiveMasterLevel(linear: number) {
    const v = Math.max(0, Math.min(1, linear));
    if (this.audioContext && this.masterGainNode) {
      const t = this.audioContext.currentTime;
      this.masterGainNode.gain.cancelScheduledValues(t);
      this.masterGainNode.gain.setTargetAtTime(0.95 * v, t, 0.025);
    }
    const Tone = window.Tone as { getDestination?: () => { volume?: { value: number } } } | undefined;
    if (Tone?.getDestination) {
      try {
        const dest = Tone.getDestination();
        if (dest?.volume) {
          const db = v <= 0.0001 ? -100 : 20 * Math.log10(v);
          dest.volume.value = db;
        }
      } catch {
        // 忽略
      }
    }
  }
}
