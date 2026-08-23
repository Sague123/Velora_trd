import { useCallback, useRef, useState } from "react";
import { classNames } from "../../lib/format";

interface ResizerProps {
  axis: "x" | "y";
  onResize: (deltaPx: number) => void;
}

/** A thin drag handle between two panels. Reports raw pixel deltas; the
 * parent owns the actual size state and clamps it. */
export function Resizer({ axis, onResize }: ResizerProps) {
  const [active, setActive] = useState(false);
  const last = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      setActive(true);
      last.current = axis === "x" ? e.clientX : e.clientY;
      (e.target as Element).setPointerCapture(e.pointerId);
    },
    [axis]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!active) return;
      const pos = axis === "x" ? e.clientX : e.clientY;
      const delta = pos - last.current;
      last.current = pos;
      onResize(delta);
    },
    [active, axis, onResize]
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    setActive(false);
    (e.target as Element).releasePointerCapture(e.pointerId);
  }, []);

  return (
    <div
      className={classNames(axis === "x" ? "resizer-x" : "resizer-y", active && "active")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
    />
  );
}
