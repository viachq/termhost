import { useEffect } from "react";

export function useResizeObserver(
  ref: React.RefObject<HTMLElement | null>,
  callback: (entry: ResizeObserverEntry) => void
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) callback(entries[0]);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, callback]);
}
