import { useState } from "react";
import { classNames } from "../../lib/format";
import { toast } from "../../store/toast";
import { IconCheck, IconCopy, IconMail, IconPhone } from "../icons/Icon";

/**
 * A phone number or an email that can actually be used.
 *
 * Before this, a number in the table was plain text: the manager selected it,
 * copied it by hand, then switched to the dialer. The desk does that a few
 * hundred times a day, so the number itself is now the call button — one tap
 * hands it to whatever app handles `tel:`, and the copy control beside it
 * covers the case where the operator dials on a separate handset.
 *
 * Clicks are stopped from bubbling on purpose: every row opens the lead card,
 * and calling someone should not also open their card behind the dialer.
 */
export function ContactAction({
  value, kind, className,
}: { value: string | null; kind: "phone" | "email"; className?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-txt-3">—</span>;

  const href = kind === "phone" ? `tel:${value.replace(/[^\d+]/g, "")}` : `mailto:${value}`;
  const Icon = kind === "phone" ? IconPhone : IconMail;

  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard is blocked outside a secure context, and silently doing
      // nothing would read as a dead button.
      toast.error("Не удалось скопировать", "Скопируйте вручную");
    }
  }

  return (
    <span className={classNames("group/contact flex items-center gap-1", className)}>
      <a
        href={href}
        onClick={(e) => e.stopPropagation()}
        title={kind === "phone" ? `Позвонить ${value}` : `Написать ${value}`}
        className={classNames(
          "btn-fx flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-txt-1 hover:bg-accent-soft hover:text-accent",
          kind === "phone" && "mono"
        )}
      >
        <Icon size={11} className="shrink-0 opacity-50 group-hover/contact:opacity-100" />
        <span className="truncate">{value}</span>
      </a>
      <button
        onClick={copy}
        aria-label={`Скопировать ${value}`}
        title="Скопировать"
        // Hidden until the row is hovered on a mouse, always visible on touch
        // where there is no hover to reveal it.
        className="btn-fx shrink-0 rounded p-0.5 text-txt-3 opacity-0 hover:text-accent focus-visible:opacity-100 group-hover/contact:opacity-100 [@media(pointer:coarse)]:opacity-100"
      >
        {copied ? <IconCheck size={11} className="text-accent" /> : <IconCopy size={11} />}
      </button>
    </span>
  );
}
