import type { PlayableScore } from "@/engine/midi/midi";

export function renderScorePlaylist(options: {
  container: HTMLElement;
  scores: PlayableScore[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
}): number {
  const { container, scores, onSelectIndex } = options;
  let selectedIndex = options.selectedIndex;
  const maxIdx = scores.length - 1;
  selectedIndex = Math.min(Math.max(0, selectedIndex), Math.max(0, maxIdx));
  container.innerHTML = "";
  scores.forEach((score, idx) => {
    const row = document.createElement("button");
    row.type = "button";
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", idx === selectedIndex ? "true" : "false");
    row.className = [
      "flex w-full items-baseline justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
      idx === selectedIndex
        ? "border border-cyan-400/50 bg-cyan-950/90 text-cyan-50 shadow-[0_0_10px_rgba(34,211,238,0.2)]"
        : "border border-transparent text-cyan-100/80 hover:border-cyan-500/25 hover:bg-slate-900/90"
    ].join(" ");
    const title = document.createElement("span");
    title.className = "min-w-0 flex-1 truncate font-medium";
    title.textContent = score.title;
    const meta = document.createElement("span");
    meta.className = "flex-shrink-0 tabular-nums text-xs text-cyan-300/70";
    meta.textContent = `${score.tempo} BPM`;
    row.appendChild(title);
    row.appendChild(meta);
    row.addEventListener("click", () => {
      if (selectedIndex === idx) return;
      onSelectIndex(idx);
    });
    container.appendChild(row);
  });
  return selectedIndex;
}
