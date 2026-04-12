import type { PianoDomRefs } from "@/hooks/usePianoDomRefs";
import { PianoApp } from "@/engine/piano/pianoApp";
import { resolvePianoDom } from "@/engine/piano/pianoDomResolve";

let app: PianoApp | null = null;

/**
 * 挂载钢琴引擎（与 React `usePianoEngine` 配合）。重复调用会先卸载上一实例。
 */
export async function initializePianoApp(options: { dom: PianoDomRefs }) {
  disposePianoApp();
  const resolved = resolvePianoDom(options.dom);
  const next = new PianoApp(resolved);
  app = next;
  await next.initialize();
}

export function disposePianoApp() {
  app?.dispose();
  app = null;
}
