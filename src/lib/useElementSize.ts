import { useEffect, useState } from "react";

/** Live width/height of an element (pass the element from a callback ref). */
export function useElementSize(element: HTMLElement | null) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return size;
}
