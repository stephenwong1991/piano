export type VoiceSource = "manual" | "score" | "pointer";

export type SynthVoice = {
  id: number;
  source: VoiceSource;
  stopped: boolean;
  gain: GainNode;
  oscillators: { osc: OscillatorNode; oscGain: GainNode }[];
  releaseSeconds: number;
  engine?: "synth";
};

export type SampleVoice = {
  id: number;
  source: VoiceSource;
  stopped: boolean;
  engine: "sample";
  noteName: string;
};

export type ActiveVoice = SynthVoice | SampleVoice;
