import { classNames } from "../../lib/format";
import { Tooltip } from "../common/Tooltip";
import { TONE_CLASS, type Tone } from "./leadLabels";

/**
 * One status chip. `hint` is what the status actually means — thirteen funnel
 * stages plus three client scales is more than anyone keeps in their head,
 * and a desk guessing at "Trash vs Deny reg" files leads inconsistently.
 */
export function StatusChip({ tone, hint, children }: {
  tone: Tone;
  hint?: string;
  children: React.ReactNode;
}) {
  const chip = (
    <span className={classNames("inline-block rounded-full px-2 py-0.5 text-2xs font-medium", TONE_CLASS[tone])}>
      {children}
    </span>
  );
  return hint ? <Tooltip label={hint}>{chip}</Tooltip> : chip;
}
