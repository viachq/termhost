import { useEffect } from "react";
import { useSettingsStore } from "../store/settingsStore";

export function usePinchZoom() {
  useEffect(() => {
    let accumulated = 0;

    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      accumulated += e.deltaY;

      if (Math.abs(accumulated) >= 30) {
        const dir = accumulated > 0 ? -1 : 1;
        accumulated = 0;
        const s = useSettingsStore.getState();
        s.setTermFontSize(s.termFontSize + dir);
      }
    };

    document.addEventListener("wheel", handler, { passive: false });
    return () => document.removeEventListener("wheel", handler);
  }, []);
}
