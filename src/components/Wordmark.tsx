import { useEffect, useRef } from "react";

/** The mark: a pair of eyes, like the pieces'. They follow the pointer. */
export function Eyes({ size = 30 }: { size?: number }) {
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = svg.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const pupils = Array.from(el.querySelectorAll<SVGCircleElement>("[data-pupil]"));
    const move = (e: PointerEvent) => {
      const box = el.getBoundingClientRect();
      const dx = e.clientX - (box.left + box.width / 2);
      const dy = e.clientY - (box.top + box.height / 2);
      const reach = Math.min(Math.hypot(dx, dy) / 120, 1) * 2.6;
      const angle = Math.atan2(dy, dx);
      pupils.forEach((p) => p.setAttribute("transform", `translate(${Math.cos(angle) * reach} ${Math.sin(angle) * reach})`));
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, []);

  return (
    <svg ref={svg} width={size} height={size * 0.56} viewBox="0 0 32 18" aria-hidden="true">
      {[9, 23].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="9" r="8" fill="var(--bone)" />
          <circle data-pupil cx={cx} cy="9" r="3.6" fill="var(--obsidian)" />
        </g>
      ))}
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <Eyes />
      DegenChess
    </span>
  );
}
