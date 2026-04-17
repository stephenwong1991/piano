import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsTrigger } from "@/components/ui/tabs";
import { usePianoDomRefs } from "@/hooks/usePianoDomRefs";
import { usePianoEngine } from "@/hooks/usePianoEngine";
import { PIANO_ROLL_VIEWPORT_MAX_CLASS } from "@/engine/piano/progressLayoutConstants";
import { cn } from "@/lib/utils";
import { Menu, X } from "lucide-react";
import { useState } from "react";

const PIANO_REPO_URL = "https://github.com/stephenwong1991/piano";

function App() {
  const pianoDom = usePianoDomRefs();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { bootError } = usePianoEngine({ dom: pianoDom });

  return (
    <main className="relative flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,#1d4ed8_0%,#020617_45%,#020617_100%)] p-2 text-slate-100 sm:p-3">
      <div
        ref={pianoDom.bootLoadingOverlay}
        id="pianoBootLoading"
        className="fixed inset-0 z-[100] hidden flex flex-col items-center justify-center bg-[radial-gradient(ellipse_95%_70%_at_50%_35%,rgba(29,78,216,0.22)_0%,rgba(2,6,23,0.94)_52%,#020617_100%)] px-4 backdrop-blur-md"
        aria-busy="false"
        aria-live="polite"
        aria-label="正在加载资源"
      >
        <div
          className={cn(
            "flex w-full max-w-[min(92vw,18rem)] flex-col items-center gap-5 rounded-2xl border border-cyan-500/30",
            "bg-slate-950/75 px-8 py-7 shadow-[0_0_0_1px_rgba(34,211,238,0.1),0_24px_56px_rgba(0,0,0,0.55),0_0_48px_rgba(34,211,238,0.06)]",
            "backdrop-blur-xl"
          )}
        >
          <div className="relative w-full select-none" aria-hidden>
            <div className="relative mx-auto w-[10rem] pt-1">
              <div className="relative flex h-[3.15rem] items-end justify-between gap-px px-0.5">
                {[46, 48, 45, 50, 46, 48, 52].map((h, i) => (
                  <div
                    key={i}
                    className="boot-loader-key w-[11px] shrink-0 rounded-b-[5px] border border-slate-400/45 border-t-0 bg-gradient-to-b from-white via-slate-100 to-slate-300 shadow-[0_4px_10px_rgba(15,23,42,0.45),inset_0_1px_0_rgba(255,255,255,0.88)]"
                    style={{ height: h, animationDelay: `${i * 0.1}s` }}
                  />
                ))}
              </div>
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[26px]">
                {[
                  { left: "13%" },
                  { left: "27.5%" },
                  { left: "55%" },
                  { left: "69.5%" },
                  { left: "84%" }
                ].map((p, i) => (
                  <div
                    key={i}
                    className="boot-loader-key absolute top-0 h-[22px] w-[7px] -translate-x-1/2 rounded-b-[3px] border border-slate-950 bg-gradient-to-b from-slate-500 via-slate-800 to-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_3px_6px_rgba(0,0,0,0.6)]"
                    style={{ left: p.left, animationDelay: `${0.05 + i * 0.1}s` }}
                  />
                ))}
              </div>
            </div>
            <div className="relative mx-auto mt-3.5 h-px w-[10rem] overflow-hidden rounded-full bg-slate-800/90">
              <div className="boot-loader-roll-shine h-full w-[42%] bg-gradient-to-r from-transparent via-cyan-400/65 to-transparent" />
            </div>
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-cyan-200/55">Piano · MIDI</p>
            <p className="max-w-[16rem] text-sm font-medium leading-snug text-cyan-50/95">
              正在加载内置曲谱与采样音色…
            </p>
            <p
              ref={pianoDom.bootLoadingPercent}
              className="min-h-[1.5rem] text-base font-semibold tabular-nums tracking-tight text-cyan-300/95"
              aria-label="采样加载状态"
            >
              0%
            </p>
          </div>
        </div>
      </div>
      <div className="mx-auto my-auto flex min-h-0 w-full max-w-[1600px] flex-col gap-2">
        <Card className="flex shrink-0 flex-col overflow-hidden border-cyan-400/35 bg-slate-950/90 shadow-[0_0_0_1px_rgba(34,211,238,0.12),0_24px_64px_rgba(0,0,0,0.55)] backdrop-blur-md">
          <CardHeader className="shrink-0 space-y-1.5 border-b border-cyan-500/20 bg-slate-950/80 px-2 py-1.5 sm:px-3 sm:py-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h1 className="bg-gradient-to-r from-cyan-200 to-sky-100 bg-clip-text text-base font-semibold tracking-tight text-transparent sm:text-lg">
                  网页版钢琴
                </h1>
                <p className="mt-0.5 line-clamp-1 text-[10px] text-cyan-100/85 sm:text-xs">
                  多轨 MIDI · 卷帘 · 本地采样 / 合成
                </p>
              </div>
              <div className="flex shrink-0 items-start gap-1.5 sm:items-center">
                <a
                  href={PIANO_REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    buttonVariants({ variant: "secondary", size: "sm" }),
                    "gap-1.5 border border-cyan-500/35 bg-slate-900/90 px-2 py-1.5 text-cyan-50 hover:border-cyan-400/55 hover:bg-slate-800/95"
                  )}
                  title="在 GitHub 查看本项目源码"
                  aria-label="在 GitHub 打开仓库 stephenwong1991/piano"
                >
                  <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.1 3.29 9.43 7.86 10.96.57.11.78-.25.78-.55 0-.27-.01-1.16-.01-2.1-3.2.7-3.87-1.37-3.87-1.37-.52-1.32-1.28-1.67-1.28-1.67-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.72 1.26 3.38.96.1-.75.4-1.26.73-1.55-2.56-.29-5.26-1.28-5.26-5.7 0-1.26.45-2.29 1.2-3.1-.12-.29-.52-1.48.11-3.09 0 0 .97-.31 3.18 1.18.92-.26 1.91-.39 2.89-.39.98 0 1.97.13 2.89.39 2.21-1.49 3.18-1.18 3.18-1.18.63 1.61.23 2.8.12 3.09.75.81 1.19 1.84 1.19 3.1 0 4.43-2.71 5.4-5.29 5.69.42.36.79 1.08.79 2.18 0 1.57-.01 2.84-.01 3.23 0 .31.21.67.79.55A10.5 10.5 0 0023.5 12C23.5 5.65 18.35.5 12 .5z" />
                  </svg>
                  <span className="hidden text-xs font-medium sm:inline">GitHub</span>
                </a>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="shrink-0 gap-1.5 border border-cyan-500/35 bg-slate-900/90 text-cyan-50 sm:hidden"
                  aria-expanded={drawerOpen}
                  aria-controls="piano-controls-drawer"
                  onClick={() => setDrawerOpen(true)}
                >
                  <Menu className="size-4" aria-hidden />
                  控制
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="hidden shrink-0 gap-1.5 border border-cyan-500/35 bg-slate-900/90 text-cyan-50 sm:inline-flex"
                  aria-expanded={drawerOpen}
                  aria-controls="piano-controls-drawer"
                  onClick={() => setDrawerOpen(true)}
                >
                  <Menu className="size-4" aria-hidden />
                  曲谱与控制
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Tabs id="modeTabs" className="border-cyan-500/30 bg-slate-900/90">
                <TabsTrigger
                  ref={pianoDom.modeTabRaw}
                  id="modeTabRaw"
                  data-mode="raw"
                  active
                  title="保留全部 MIDI 轨（与库乐队多轨一致），卷帘分轨显示"
                >
                  原始
                </TabsTrigger>
                <TabsTrigger
                  ref={pianoDom.modeTabMelody}
                  id="modeTabMelody"
                  data-mode="melody"
                  title="每拍只保留最高音，适合跟弹主旋律"
                >
                  旋律
                </TabsTrigger>
              </Tabs>
              <Badge
                ref={pianoDom.tempoBadge}
                id="tempoBadge"
                variant="secondary"
                className="border border-cyan-500/25 bg-slate-900/90 text-[10px] text-cyan-100 sm:text-xs"
              >
                速度 100%
              </Badge>
              <Badge
                ref={pianoDom.engineBadge}
                id="engineBadge"
                variant="secondary"
                className="border border-violet-500/25 bg-slate-900/90 text-[10px] text-violet-100 sm:text-xs"
              >
                合成音色
              </Badge>
              <Badge
                ref={pianoDom.gridBadge}
                id="gridBadge"
                variant="secondary"
                className="cursor-pointer select-none border border-cyan-500/30 bg-slate-900/90 text-[10px] text-cyan-100 hover:border-cyan-400/70 sm:text-xs"
              >
                网格 1/4 拍
              </Badge>
              <Badge
                ref={pianoDom.quantizeBadge}
                id="quantizeBadge"
                variant="secondary"
                className="cursor-pointer select-none border border-cyan-500/30 bg-slate-900/90 text-[10px] text-cyan-100 hover:border-cyan-400/70 sm:text-xs"
              >
                吸附 按拍
              </Badge>
              <Badge
                ref={pianoDom.statusBadge}
                id="statusBadge"
                className="max-w-[min(100%,12rem)] truncate border border-emerald-500/35 bg-emerald-950/50 text-[10px] text-emerald-100 sm:max-w-[16rem] sm:text-xs"
              >
                准备就绪
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-2 overflow-hidden p-2 pt-2 sm:p-3">
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                ref={pianoDom.playPauseBtn}
                id="playPauseBtn"
                type="button"
                size="sm"
                title="播放 / 暂停"
                className="min-w-[4.5rem] border border-cyan-400/40 shadow-[0_0_16px_rgba(34,211,238,0.2)] data-[state=playing]:border-amber-400/50 data-[state=playing]:shadow-[0_0_14px_rgba(251,191,36,0.18)]"
              >
                播放
              </Button>
              <Button ref={pianoDom.stopBtn} id="stopBtn" type="button" variant="secondary" size="sm" className="border border-slate-600/80">
                停止
              </Button>
            </div>

            <div className="flex shrink-0 flex-col rounded-lg border border-cyan-500/30 bg-slate-950/85 p-2 shadow-[inset_0_0_24px_rgba(34,211,238,0.06)]">
              <div className="mb-1 shrink-0 text-[11px] font-semibold tracking-wide text-cyan-300">曲谱播放进度</div>
              <div className={cn("min-h-0 w-full min-w-0 overflow-x-hidden overflow-y-auto rounded-md", PIANO_ROLL_VIEWPORT_MAX_CLASS)}>
                <canvas
                  ref={pianoDom.progressCanvas}
                  id="progressCanvas"
                  className="block min-h-[96px] w-full min-w-0 cursor-ew-resize bg-[#020617]"
                />
              </div>
            </div>

            <div ref={pianoDom.status} id="status" className="shrink-0 truncate text-[11px] font-medium text-cyan-200 sm:text-xs">
              {bootError ? `初始化失败：${bootError}` : "准备就绪"}
            </div>
          </CardContent>
        </Card>

        <section className="flex shrink-0 flex-col gap-1 overflow-hidden rounded-xl border border-cyan-500/35 bg-[#020617] p-1 shadow-[0_0_0_1px_rgba(34,211,238,0.12),inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-1.5">
          <p className="shrink-0 px-0.5 text-[10px] leading-tight text-cyan-200/70 sm:px-1">
            按住空格：延音踏板（松键后仍可保持余音；松踏板时对已抬键的音释放）
          </p>
          <div ref={pianoDom.piano} id="piano" className="piano w-full" aria-label="88键钢琴" />
        </section>
      </div>

      {/* 移动端：底部动作面板；桌面：右侧抽屉 */}
      <div
        className={cn(
          "fixed inset-0 z-50 transition-[opacity,visibility]",
          drawerOpen ? "visible opacity-100" : "pointer-events-none invisible opacity-0"
        )}
        aria-hidden={!drawerOpen}
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
          aria-label="关闭控制面板"
          onClick={() => setDrawerOpen(false)}
        />
        <aside
          id="piano-controls-drawer"
          className={cn(
            "absolute flex w-full flex-col border-cyan-500/30 bg-slate-950/98 shadow-2xl backdrop-blur-md transition-transform duration-200 ease-out",
            "bottom-0 left-0 right-0 max-h-[85dvh] rounded-t-2xl border-x border-t",
            "sm:bottom-auto sm:left-auto sm:right-2 sm:top-2 sm:h-[calc(100dvh-1rem)] sm:max-h-none sm:w-[min(22rem,calc(100vw-1rem))] sm:rounded-xl sm:border",
            drawerOpen ? "translate-y-0 sm:translate-x-0" : "translate-y-full sm:translate-y-0 sm:translate-x-[calc(100%+0.75rem)]"
          )}
        >
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-600/80 sm:hidden" aria-hidden />
          <div className="flex items-center justify-between gap-2 border-b border-cyan-500/20 px-3 py-2">
            <span className="text-sm font-semibold text-cyan-100">曲谱与控制</span>
            <Button type="button" size="icon" variant="ghost" className="size-8 shrink-0 text-cyan-200" onClick={() => setDrawerOpen(false)} aria-label="关闭">
              <X className="size-4" />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-2">
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-cyan-500/25 bg-slate-900/70 px-2 py-1.5">
                  <label htmlFor="volume" className="shrink-0 text-xs font-medium text-cyan-100">
                    音量
                  </label>
                  <input
                    ref={pianoDom.volume}
                    id="volume"
                    type="range"
                    min="0"
                    max="100"
                    defaultValue="70"
                    className="min-w-0 flex-1 accent-cyan-400"
                  />
                  <span
                    ref={pianoDom.volumeValue}
                    id="volumeValue"
                    className="w-9 shrink-0 text-right text-xs font-medium tabular-nums text-cyan-50"
                  >
                    70%
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-cyan-500/25 bg-slate-900/70 px-2 py-1.5">
                  <label htmlFor="tempoScale" className="shrink-0 text-xs font-medium text-cyan-100">
                    播放速度
                  </label>
                  <input
                    ref={pianoDom.tempoScale}
                    id="tempoScale"
                    type="range"
                    min="50"
                    max="160"
                    defaultValue="100"
                    className="min-w-0 flex-1 accent-cyan-400"
                  />
                  <span
                    ref={pianoDom.tempoScaleValue}
                    id="tempoScaleValue"
                    className="w-9 shrink-0 text-right text-xs font-medium tabular-nums text-cyan-50"
                  >
                    100%
                  </span>
                </div>

                <div className="flex flex-col gap-1.5 rounded-lg border border-cyan-500/25 bg-slate-900/70 px-2 py-1.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span id="keyboardBaseLabel" className="text-xs font-medium text-cyan-100">
                      键盘音区
                    </span>
                    <span className="text-[10px] text-cyan-200/70">[ ] 八度</span>
                  </div>
                  <select ref={pianoDom.keyboardBase} id="keyboardBase" className="sr-only" aria-labelledby="keyboardBaseLabel" />
                  <div
                    ref={pianoDom.keyboardBaseList}
                    className="max-h-[min(36vh,260px)] space-y-1 overflow-y-auto rounded-md border border-cyan-500/20 bg-slate-950/80 p-1"
                  />
                </div>
              </div>

              <div className="hidden">
                <NativeSelect ref={pianoDom.playbackMode} id="playbackMode" defaultValue="raw">
                  <option value="raw">原始模式（全轨）</option>
                  <option value="melody">旋律模式</option>
                </NativeSelect>
              </div>

              <div className="flex flex-col gap-2 rounded-lg border border-cyan-500/25 bg-slate-900/70 p-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-cyan-300/90">内置曲谱</div>
                <div
                  ref={pianoDom.scorePlaylist}
                  id="scorePlaylist"
                  role="listbox"
                  aria-label="内置曲谱列表"
                  className="max-h-[min(40vh,220px)] overflow-y-auto rounded-md border border-cyan-500/20 bg-slate-950/80 p-1 sm:max-h-[280px]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-cyan-500/25 bg-slate-900/70 px-2 py-1.5">
                <span className="shrink-0 text-xs font-medium text-cyan-100">导入曲谱</span>
                <input ref={pianoDom.scoreFile} id="scoreFile" type="file" accept=".json,application/json,.mid,.midi,audio/midi,audio/x-midi,application/x-midi" className="sr-only" />
                <label
                  htmlFor="scoreFile"
                  className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "cursor-pointer border border-cyan-500/30")}
                >
                  选择文件
                </label>
                <span className="text-[10px] text-cyan-200/75">.json / .mid</span>
              </div>

              <details className="rounded-lg border border-cyan-500/20 bg-slate-900/60 p-2 text-xs text-cyan-100/90">
                <summary className="cursor-pointer font-medium text-cyan-200">JSON 格式示例</summary>
                <pre className="mt-2 max-h-24 overflow-auto rounded-md border border-cyan-500/15 bg-slate-950/80 p-2 text-[10px] leading-relaxed text-cyan-200">
                  {`{
  "title": "示例曲",
  "tempo": 96,
  "events": [
    { "beat": 0, "duration": 1, "note": "C4" }
  ],
  "sustainPedalEvents": [
    { "beat": 0, "down": true },
    { "beat": 2, "down": false }
  ]
}`}
                </pre>
              </details>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

export default App;
