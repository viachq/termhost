import { useCallback, useRef } from "react";
import type { SplitNode } from "../types";

export function useDividerDrag(
  direction: SplitNode["direction"],
  onRatioChange: (ratio: number) => void,
  onDragEnd: () => void
) {
  const dragging = useRef(false);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;

      const container = (e.target as HTMLElement).parentElement!;
      const rect = container.getBoundingClientRect();

      const overlay = document.createElement("div");
      overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;cursor:" +
        (direction === "horizontal" ? "col-resize" : "row-resize");
      document.body.appendChild(overlay);

      const dividerEl = e.target as HTMLElement;
      dividerEl.classList.add("dragging");

      let raf = 0;

      const onMove = (ev: MouseEvent) => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          let ratio: number;
          if (direction === "horizontal") {
            ratio = (ev.clientX - rect.left) / rect.width;
          } else {
            ratio = (ev.clientY - rect.top) / rect.height;
          }
          ratio = Math.max(0.1, Math.min(0.9, ratio));
          onRatioChange(ratio);
        });
      };

      const onUp = () => {
        dragging.current = false;
        cancelAnimationFrame(raf);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        overlay.remove();
        dividerEl.classList.remove("dragging");
        onDragEnd();
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [direction, onRatioChange, onDragEnd]
  );

  return { onMouseDown };
}
