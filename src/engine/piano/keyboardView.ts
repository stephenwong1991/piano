import { BLACK_CLASSES, MAX_MIDI, MIN_MIDI, WHITE_KEY_COUNT } from "@/engine/piano/constants";
import { midiToNoteName } from "@/engine/piano/noteUtils";

export function createPianoKeys(
  pianoEl: HTMLElement,
  onPointerDown: (midi: number) => void | Promise<void>,
  onPointerUp: (midi: number) => void
): Map<number, HTMLButtonElement> {
  const keyElements = new Map<number, HTMLButtonElement>();
  for (let midi = MIN_MIDI; midi <= MAX_MIDI; midi += 1) {
    const noteClass = midi % 12;
    const isBlack = BLACK_CLASSES.has(noteClass);
    const key = document.createElement("button");
    key.type = "button";
    key.className = `key ${isBlack ? "black" : "white"}`;
    key.dataset.midi = String(midi);
    key.title = midiToNoteName(midi);

    const label = document.createElement("span");
    label.className = "key-label";
    label.textContent = midiToNoteName(midi);
    key.appendChild(label);

    const releaseCapture = (event: PointerEvent) => {
      try {
        if (key.hasPointerCapture(event.pointerId)) {
          key.releasePointerCapture(event.pointerId);
        }
      } catch {
        // 部分环境下 release 可能抛错，忽略即可
      }
    };

    key.addEventListener("pointerdown", async (event) => {
      event.preventDefault();
      try {
        key.setPointerCapture(event.pointerId);
      } catch {
        // 忽略
      }
      await onPointerDown(midi);
    });
    key.addEventListener("pointerup", (event) => {
      releaseCapture(event);
      onPointerUp(midi);
    });
    key.addEventListener("pointercancel", (event) => {
      releaseCapture(event);
      onPointerUp(midi);
    });
    key.addEventListener("pointerleave", () => {
      onPointerUp(midi);
    });
    key.addEventListener("contextmenu", (event) => event.preventDefault());

    keyElements.set(midi, key);
    pianoEl.appendChild(key);
  }
  return keyElements;
}

export function layoutPianoKeys(pianoEl: HTMLElement, keyElements: Map<number, HTMLButtonElement>) {
  if (keyElements.size === 0) return;
  const contentWidth = Math.max(640, Math.floor(pianoEl.clientWidth || pianoEl.getBoundingClientRect().width || 1370));
  const whiteHeight = Math.max(176, Math.min(240, Math.round(contentWidth * 0.105)));
  const blackHeight = Math.round(whiteHeight * 0.614);
  const whiteWidth = contentWidth / WHITE_KEY_COUNT;
  const blackWidth = Math.max(10, whiteWidth * 0.62);
  let whiteIndex = 0;
  for (let midi = MIN_MIDI; midi <= MAX_MIDI; midi += 1) {
    const key = keyElements.get(midi);
    if (!key) continue;
    const isBlack = BLACK_CLASSES.has(midi % 12);
    if (isBlack) {
      key.style.left = `${whiteIndex * whiteWidth - blackWidth / 2}px`;
      key.style.width = `${blackWidth}px`;
      key.style.height = `${blackHeight}px`;
    } else {
      key.style.left = `${whiteIndex * whiteWidth}px`;
      key.style.width = `${whiteWidth}px`;
      key.style.height = `${whiteHeight}px`;
      whiteIndex += 1;
    }
  }
  pianoEl.style.height = `${whiteHeight + 8}px`;
}

export function setKeyActive(keyElements: Map<number, HTMLButtonElement>, midi: number, active: boolean) {
  const el = keyElements.get(midi);
  if (!el) return;
  if (active) {
    el.classList.add("active");
  } else {
    el.classList.remove("active");
  }
}
