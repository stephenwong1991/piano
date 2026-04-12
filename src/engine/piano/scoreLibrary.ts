import { type ParsedMidi, midiToScore, parseMidi, type PlayableScore } from "@/engine/midi/midi";
import { BUILTIN_SCORES } from "@/engine/piano/builtinAssets";
import { FALLBACK_SCORES } from "@/engine/piano/fallbackScores";

export type BuiltinParsedItem = { title: string; parsed: ParsedMidi };

export class ScoreLibrary {
  readonly loadedScores: PlayableScore[] = [];
  readonly importedScores: PlayableScore[] = [];
  readonly builtinParsedScores: BuiltinParsedItem[] = [];
  usingFallbackScores = false;

  constructor(
    private minMidi: number,
    private maxMidi: number
  ) {}

  rebuildLoadedScores(playbackMode: "melody" | "raw") {
    this.loadedScores.length = 0;
    if (this.usingFallbackScores) {
      FALLBACK_SCORES.forEach((score) => this.loadedScores.push(score as PlayableScore));
    } else {
      this.builtinParsedScores.forEach((item) => {
        this.loadedScores.push(midiToScore(item.parsed, item.title, playbackMode, this.minMidi, this.maxMidi));
      });
    }
    this.importedScores.forEach((score) => this.loadedScores.push(score));
  }

  private async fetchBuiltinEntry(item: { title: string; file: string }): Promise<BuiltinParsedItem> {
    const response = await fetch(item.file, { cache: "default" });
    if (!response.ok) {
      throw new Error(`加载失败: ${item.title}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return { title: item.title, parsed: parseMidi(arrayBuffer) };
  }

  /**
   * 先完成列表中第一首（或第一首失败时尽快拿到任意一首），即可 rebuild 首屏；
   * 其余曲谱后台并行拉取，避免 GitHub Pages 下多资源与大量 MP3 抢连接导致长时间白等。
   */
  async loadBuiltinMidiScores(
    playbackMode: "melody" | "raw",
    listeners?: { onBatch?: () => void; onComplete?: (asyncFailed: string[]) => void }
  ): Promise<string[]> {
    if (this.builtinParsedScores.length > 0) {
      this.rebuildLoadedScores(playbackMode);
      return [];
    }

    const failures: string[] = [];
    const orderMap = new Map(BUILTIN_SCORES.map((s, i) => [s.title, i]));

    const sortParsed = () => {
      this.builtinParsedScores.sort((a, b) => (orderMap.get(a.title) ?? 999) - (orderMap.get(b.title) ?? 999));
    };

    const pushAndRebuild = () => {
      sortParsed();
      this.rebuildLoadedScores(playbackMode);
      listeners?.onBatch?.();
    };

    const primary = BUILTIN_SCORES[0];
    let opened = false;
    try {
      this.builtinParsedScores.push(await this.fetchBuiltinEntry(primary));
      opened = true;
    } catch {
      failures.push(primary.title);
    }

    if (!opened) {
      for (const item of BUILTIN_SCORES.slice(1)) {
        try {
          this.builtinParsedScores.push(await this.fetchBuiltinEntry(item));
          opened = true;
          break;
        } catch {
          failures.push(item.title);
        }
      }
    }

    pushAndRebuild();

    if (!opened) {
      listeners?.onComplete?.([]);
      return failures;
    }

    const pending = BUILTIN_SCORES.filter((x) => !this.builtinParsedScores.some((p) => p.title === x.title));
    if (pending.length === 0) {
      listeners?.onComplete?.([]);
      return failures;
    }

    void (async () => {
      const asyncFailed: string[] = [];
      const settled = await Promise.allSettled(pending.map((item) => this.fetchBuiltinEntry(item)));
      settled.forEach((result, idx) => {
        if (result.status === "fulfilled") {
          this.builtinParsedScores.push(result.value);
        } else {
          asyncFailed.push(pending[idx].title);
        }
      });
      pushAndRebuild();
      listeners?.onComplete?.(asyncFailed);
    })();

    return failures;
  }
}
