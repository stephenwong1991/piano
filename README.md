# Piano（Vite + React + Tone.js）

网页版 88 键钢琴，支持 MIDI 自动解析与播放、钢琴卷帘进度可视化、以及本地采样钢琴音色。

## 功能概览

- 88 键完整钢琴（A0-C8），支持鼠标和键盘演奏
- MIDI 文件自动识别：扫描 `assets/midi/*.mid` 并生成内置曲谱列表
- 播放控制：播放、暂停、停止、速度调节、拖拽/点击进度跳转
- 播放模式：`Melody Mode`（主旋律）/`Raw Mode`（原始）
- Canvas Piano Roll：网格、时间标签、hover 提示、量化跳转
- 音源策略：
  - 优先使用 Tone.js `Sampler` + 本地采样（离线可用）
  - 本地采样缺失时自动回退到内置 WebAudio 合成器

## 技术栈

- `Vite` + `React` + `TypeScript`
- `Tone.js`
- `Tailwind CSS`
- `shadcn/ui`

## 本地开发

安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm run dev
```

生产构建：

```bash
npm run build
```

本地预览：

```bash
npm run preview
```

## 目录结构（关键）

```txt
assets/
  midi/                      # 内置 MIDI，自动被扫描
  samples/
    salamander/              # 本地钢琴采样（Tone.js Sampler 使用）
      A0.mp3
      ...
      C8.mp3
src/
  engine/
    pianoEngine.ts           # 播放主引擎
```

## 本地采样说明（已改为本地优先）

当前代码会从 `assets/samples/salamander/*.mp3` 自动加载本地采样，不再依赖远程 `baseUrl`。

- 对应代码位置：`src/engine/pianoEngine.ts`
- 采样映射定义：`src/engine/audio/audioUtils.ts` 中 `SAMPLE_PIANO_URLS`
- 若本地样本不存在或不完整，会自动回退到 WebAudio 合成器

## Tone.js Salamander 本地文件清单

以下文件已下载到 `assets/samples/salamander/`：

- `A0.mp3`
- `C1.mp3`
- `Ds1.mp3`
- `Fs1.mp3`
- `A1.mp3`
- `C2.mp3`
- `Ds2.mp3`
- `Fs2.mp3`
- `A2.mp3`
- `C3.mp3`
- `Ds3.mp3`
- `Fs3.mp3`
- `A3.mp3`
- `C4.mp3`
- `Ds4.mp3`
- `Fs4.mp3`
- `A4.mp3`
- `C5.mp3`
- `Ds5.mp3`
- `Fs5.mp3`
- `A5.mp3`
- `C6.mp3`
- `Ds6.mp3`
- `Fs6.mp3`
- `A6.mp3`
- `C7.mp3`
- `Ds7.mp3`
- `Fs7.mp3`
- `A7.mp3`
- `C8.mp3`

来源（下载镜像基地址）：

- `https://tonejs.github.io/audio/salamander/`

> 注意：请保留上述文件名不变，否则映射不到对应音高。

## 内置 MIDI

内置 MIDI 由 `assets/midi/*.mid` 自动生成列表。当前仓库示例：

- `summer.mid`
- `富士山下.mid`

新增 MIDI 时，放入 `assets/midi` 后重启开发服务或等待 HMR 更新即可。
