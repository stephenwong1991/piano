export interface ParsedNote {
  channel: number;
  pitch: number;
  velocity: number;
  startBeat: number;
  durationBeat: number;
  /** 来自文件中的第几条 MTrk（0-based），与库乐队「轨道」对应 */
  trackIndex: number;
}

export interface ParsedMidi {
  tempo: number;
  notes: ParsedNote[];
  /** MThd 中的轨道段数量（含仅元数据的轨） */
  headerTrackCount: number;
  /**
   * 全曲合并后的 CC64（延音踏板）时间线，beat = tick / ticksPerBeat（与音符同一绝对时间轴）。
   * 同一 tick 多条取最后一条。
   */
  sustainPedalTimeline?: { beat: number; down: boolean }[];
}

export interface ScoreEvent {
  beat: number;
  /** 实际播放时值（含踏板延长后的结束时间） */
  duration: number;
  /**
   * 卷帘可视化用的音符「键长」（通常为踏板前的原时值；未设置时与 duration 相同）
   */
  durationVisual?: number;
  midiList: number[];
  velocity?: number;
  /** 源自 MIDI 的轨道索引，用于多轨着色；JSON 导入可无此字段 */
  trackIndex?: number;
}

export interface PlayableScore {
  title: string;
  tempo: number;
  events: ScoreEvent[];
  /** 与 events 同一拍坐标系下的 CC64 踏板（可选，用于展示或再导出） */
  sustainPedalEvents?: { beat: number; down: boolean }[];
  /** 本曲谱事件里出现的不同 MIDI 轨道数（有音符的轨） */
  midiTracksDetected?: number;
  /** 文件头中的 MTrk 数量 */
  midiHeaderTrackCount?: number;
}

function readVarLen(view: DataView, offset: number) {
  let result = 0;
  let i = offset;
  while (i < view.byteLength) {
    const byte = view.getUint8(i);
    i += 1;
    result = (result << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      break;
    }
  }
  return { value: result, next: i };
}

function bytesToText(view: DataView, offset: number, length: number) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += String.fromCharCode(view.getUint8(offset + i));
  }
  return out;
}

function extractTopLineMelody(notes: ParsedNote[]) {
  const noteMap = new Map<number, ParsedNote>();
  notes.forEach((note) => {
    const beat = Number(note.startBeat.toFixed(4));
    const existing = noteMap.get(beat);
    if (!existing || note.pitch > existing.pitch || (note.pitch === existing.pitch && note.durationBeat > existing.durationBeat)) {
      noteMap.set(beat, note);
    }
  });
  return Array.from(noteMap.values()).sort((a, b) => a.startBeat - b.startBeat);
}

export function parseMidi(arrayBuffer: ArrayBuffer): ParsedMidi {
  const view = new DataView(arrayBuffer);
  let offset = 0;
  const chunkId = bytesToText(view, offset, 4);
  if (chunkId !== "MThd") {
    throw new Error("MIDI 文件头无效");
  }
  offset += 4;
  const headerLen = view.getUint32(offset);
  offset += 4;
  offset += 2; // format
  const trackCount = view.getUint16(offset);
  offset += 2;
  const division = view.getUint16(offset);
  offset += 2;
  offset += headerLen - 6;

  if ((division & 0x8000) !== 0) {
    throw new Error("暂不支持 SMPTE 时间格式 MIDI");
  }
  const ticksPerBeat = division;
  let firstTempoBpm = 120;
  const notes: ParsedNote[] = [];
  const sustainPedalRaw: { tick: number; down: boolean }[] = [];

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
    const id = bytesToText(view, offset, 4);
    offset += 4;
    if (id !== "MTrk") {
      throw new Error("MIDI 轨道区块无效");
    }
    const trackLen = view.getUint32(offset);
    offset += 4;
    const end = offset + trackLen;
    let tick = 0;
    let runningStatus: number | null = null;
    const noteOnMap = new Map<string, { tick: number; channel: number; pitch: number; velocity: number }>();

    while (offset < end) {
      const delta = readVarLen(view, offset);
      tick += delta.value;
      offset = delta.next;
      if (offset >= end) break;
      let status = view.getUint8(offset);
      if (status < 0x80) {
        if (runningStatus === null) throw new Error("MIDI running status 解析失败");
        status = runningStatus;
      } else {
        offset += 1;
        runningStatus = status;
      }
      if (status === 0xff) {
        const metaType = view.getUint8(offset);
        offset += 1;
        const lenInfo = readVarLen(view, offset);
        const dataLen = lenInfo.value;
        offset = lenInfo.next;
        if (metaType === 0x51 && dataLen === 3 && firstTempoBpm === 120) {
          const usPerBeat = (view.getUint8(offset) << 16) | (view.getUint8(offset + 1) << 8) | view.getUint8(offset + 2);
          firstTempoBpm = Math.round(60000000 / usPerBeat);
        }
        offset += dataLen;
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        const lenInfo = readVarLen(view, offset);
        offset = lenInfo.next + lenInfo.value;
        continue;
      }

      const eventType = status & 0xf0;
      const channel = status & 0x0f;
      const data1 = view.getUint8(offset);
      offset += 1;
      const hasTwoBytes = eventType !== 0xc0 && eventType !== 0xd0;
      const data2 = hasTwoBytes ? view.getUint8(offset) : 0;
      if (hasTwoBytes) offset += 1;

      if (eventType === 0xb0 && data1 === 64) {
        if (channel !== 9) {
          sustainPedalRaw.push({ tick, down: data2 >= 64 });
        }
        continue;
      }

      if (eventType === 0x90 && data2 > 0) {
        noteOnMap.set(`${channel}:${data1}`, { tick, channel, pitch: data1, velocity: data2 });
      } else if (eventType === 0x80 || (eventType === 0x90 && data2 === 0)) {
        const key = `${channel}:${data1}`;
        const started = noteOnMap.get(key);
        if (started) {
          const durationTick = Math.max(1, tick - started.tick);
          notes.push({
            channel: started.channel,
            pitch: started.pitch,
            velocity: started.velocity,
            startBeat: started.tick / ticksPerBeat,
            durationBeat: durationTick / ticksPerBeat,
            trackIndex
          });
          noteOnMap.delete(key);
        }
      }
    }
    offset = end;
  }

  sustainPedalRaw.sort((a, b) => a.tick - b.tick);
  const sustainPedalMerged: { tick: number; down: boolean }[] = [];
  for (const e of sustainPedalRaw) {
    if (sustainPedalMerged.length && sustainPedalMerged[sustainPedalMerged.length - 1].tick === e.tick) {
      sustainPedalMerged[sustainPedalMerged.length - 1] = e;
    } else {
      sustainPedalMerged.push(e);
    }
  }
  const sustainPedalTimeline =
    sustainPedalMerged.length > 0
      ? sustainPedalMerged.map((e) => ({ beat: e.tick / ticksPerBeat, down: e.down }))
      : undefined;

  return { tempo: firstTempoBpm, notes, headerTrackCount: trackCount, sustainPedalTimeline };
}

/** 在 noteEnd 处若踏板仍为踩下，则把「松开」时刻推迟到其后第一次踏板松开 */
function extendNoteEndBeat(
  noteEndBeat: number,
  sustainTimeline: { beat: number; down: boolean }[],
  songEnd: number
): number {
  if (sustainTimeline.length === 0) return noteEndBeat;
  let on = false;
  for (const e of sustainTimeline) {
    if (e.beat > noteEndBeat) break;
    on = e.down;
  }
  if (!on) return noteEndBeat;
  for (const e of sustainTimeline) {
    if (e.beat > noteEndBeat && !e.down) {
      return e.beat;
    }
  }
  return songEnd;
}

function applySustainToScoreEvents<T extends ScoreEvent>(
  events: T[],
  sustainTimeline: { beat: number; down: boolean }[]
): T[] {
  if (sustainTimeline.length === 0) {
    return events.map((e) => ({
      ...e,
      durationVisual: e.durationVisual ?? e.duration
    })) as T[];
  }
  const songEnd = Math.max(
    0,
    ...events.map((e) => e.beat + (e.durationVisual ?? e.duration)),
    ...sustainTimeline.map((p) => p.beat)
  );
  return events.map((e) => {
    const fingerDur = e.durationVisual ?? e.duration;
    const end = e.beat + fingerDur;
    const ext = extendNoteEndBeat(end, sustainTimeline, songEnd);
    return {
      ...e,
      durationVisual: fingerDur,
      duration: Number(Math.max(0.125, ext - e.beat).toFixed(4))
    };
  }) as T[];
}

export function midiToScore(parsed: ParsedMidi, title: string, mode: "melody" | "raw", minMidi: number, maxMidi: number): PlayableScore {
  const filteredNotes = parsed.notes
    .filter((n) => n.channel !== 9)
    .filter((n) => n.pitch >= minMidi && n.pitch <= maxMidi)
    .sort((a, b) => a.startBeat - b.startBeat);
  const melodyNotes = extractTopLineMelody(filteredNotes);
  const notes = mode === "raw" ? filteredNotes : melodyNotes.length > 0 ? melodyNotes : filteredNotes;
  const rawPedal = parsed.sustainPedalTimeline ?? [];
  const minPedal = rawPedal.length ? Math.min(...rawPedal.map((p) => p.beat)) : Infinity;
  const firstBeat = Math.min(notes.length > 0 ? notes[0].startBeat : Infinity, minPedal);
  const fb = Number.isFinite(firstBeat) ? firstBeat : 0;

  const relPedal = rawPedal.map((p) => ({ beat: p.beat - fb, down: p.down }));

  let events = notes.map((n) => ({
    beat: Number(Math.max(0, n.startBeat - fb).toFixed(4)),
    duration: Number(Math.max(0.125, n.durationBeat).toFixed(4)),
    midiList: [n.pitch],
    velocity: Number.isFinite(Number(n.velocity)) ? Number(n.velocity) : 100,
    trackIndex: n.trackIndex
  }));

  /** 先锁定谱面时值，再烘焙延音；避免无 durationVisual 时 UI 误用延长后的 duration */
  events = events.map((e) => ({ ...e, durationVisual: e.duration }));

  events = applySustainToScoreEvents(events, relPedal);

  const trackIdxSet = new Set(events.map((e) => e.trackIndex).filter((t): t is number => typeof t === "number"));

  return {
    title,
    tempo: parsed.tempo,
    events,
    ...(relPedal.length ? { sustainPedalEvents: relPedal } : {}),
    midiTracksDetected: trackIdxSet.size,
    midiHeaderTrackCount: parsed.headerTrackCount
  };
}

export function normalizeScore(raw: unknown, noteNameToMidi: (note: string) => number | null): PlayableScore {
  if (!raw || typeof raw !== "object") {
    throw new Error("曲谱不是合法 JSON 对象");
  }
  const score = raw as Record<string, any>;
  if (!Array.isArray(score.events) || score.events.length === 0) {
    throw new Error("曲谱缺少 events 数组");
  }
  const tempo = Number(score.tempo) > 0 ? Number(score.tempo) : 90;
  const title = score.title ? String(score.title) : "导入曲谱";
  let pedalFromJson: { beat: number; down: boolean }[] = [];
  if (Array.isArray(score.sustainPedalEvents)) {
    pedalFromJson = score.sustainPedalEvents
      .map((row: Record<string, unknown>) => ({
        beat: Number(row.beat),
        down: Boolean(row.down)
      }))
      .filter((p) => Number.isFinite(p.beat));
    pedalFromJson.sort((a, b) => a.beat - b.beat);
  }

  let events = score.events.map((event: Record<string, any>, idx: number) => {
    const beat = Number.isFinite(Number(event.beat)) ? Number(event.beat) : idx;
    const duration = Number(event.duration);
    if (!(duration > 0)) {
      throw new Error(`第 ${idx + 1} 个音符 duration 无效`);
    }
    let notes: string[] = [];
    if (typeof event.note === "string") {
      notes = [event.note];
    } else if (Array.isArray(event.notes)) {
      notes = event.notes.slice();
    }
    const midiList = notes.map((n) => noteNameToMidi(n)).filter((midi): midi is number => typeof midi === "number");
    if (midiList.length === 0) {
      throw new Error(`第 ${idx + 1} 个音符 note/notes 无效`);
    }
    return { beat, duration, midiList };
  });

  events = events.map((e) => ({ ...e, durationVisual: e.duration }));

  events = applySustainToScoreEvents(events, pedalFromJson);

  return {
    title,
    tempo,
    events,
    ...(pedalFromJson.length ? { sustainPedalEvents: pedalFromJson } : {})
  };
}

export function toPlayableScore(score: any, noteNameToMidi: (note: string) => number | null): PlayableScore {
  if (score && Array.isArray(score.events) && score.events.every((event: any) => Array.isArray(event.midiList))) {
    return score as PlayableScore;
  }
  return normalizeScore(score, noteNameToMidi);
}
