import { useCallback, useState } from "react";

/** Pixel-based panel size with a drag delta reducer and min/max clamping. */
export function useResizable(initial: number, min: number, max: number) {
  const [size, setSize] = useState(initial);
  const onDelta = useCallback(
    (delta: number) => {
      setSize((s) => Math.min(max, Math.max(min, s + delta)));
    },
    [min, max]
  );
  return [size, onDelta] as const;
}

/** Same idea but the drag delta shrinks the size (handle sits on the far side). */
export function useResizableInverted(initial: number, min: number, max: number) {
  const [size, setSize] = useState(initial);
  const onDelta = useCallback(
    (delta: number) => {
      setSize((s) => Math.min(max, Math.max(min, s - delta)));
    },
    [min, max]
  );
  return [size, onDelta] as const;
}
