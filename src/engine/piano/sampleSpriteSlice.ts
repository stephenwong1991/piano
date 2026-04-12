/**
 * 从已解码的 sprite `AudioBuffer` 切出一段，供 `Tone.Sampler` 按 note 使用。
 * 多音同时播放时各自持有独立 `AudioBuffer`，互不影响。
 */
export function sliceAudioBufferRegion(source: AudioBuffer, startSec: number, durationSec: number): AudioBuffer {
  const rate = source.sampleRate;
  const startSample = Math.max(0, Math.floor(startSec * rate));
  const endExclusive = Math.min(source.length, Math.ceil((startSec + durationSec) * rate));
  const length = Math.max(0, endExclusive - startSample);
  const channels = source.numberOfChannels;
  const out = new AudioBuffer({
    length,
    numberOfChannels: channels,
    sampleRate: rate
  });
  for (let c = 0; c < channels; c += 1) {
    const src = source.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < length; i += 1) {
      dst[i] = src[startSample + i] ?? 0;
    }
  }
  return out;
}
