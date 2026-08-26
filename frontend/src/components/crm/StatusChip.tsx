import { classNames } from "../../lib/format";
import { TONE_CLASS, type Tone } from "./leadLabels";

export function StatusChip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={classNames("rounded px-1.5 py-0.5 text-2xs font-medium", TONE_CLASS[tone])}>
      {children}
    </span>
  );
}
