/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * 生产：默认已用 `https://tonejs.github.io/audio/salamander`。
   * 填其它 URL 可换镜像；填 `local` 或 `bundle` 则改用打包进 dist 的本地 MP3。
   */
  readonly VITE_SAMPLE_BASE_URL?: string;
  /**
   * `false`：禁用 `sprite.mp3` + 时间轴表，改走多文件 URL。
   * `true`：强制走 sprite（需存在 `VITE_SAMPLE_SPRITE_URL` 或打包内的 `sprite.mp3`）。
   */
  readonly VITE_SAMPLE_USE_SPRITE?: string;
  /** 覆盖 sprite 音频地址（不填则用 `assets/samples/salamander/sprite.mp3` 打包 URL） */
  readonly VITE_SAMPLE_SPRITE_URL?: string;
}
