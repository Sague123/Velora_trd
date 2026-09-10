import { useState, type KeyboardEvent } from "react";
import { useSetLeadTags } from "../../hooks/useCrm";
import { classNames } from "../../lib/format";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";
import { fieldCls } from "../../lib/ui";
import { IconClose } from "../icons/Icon";

const MAX_TAGS = 20;

/**
 * The labels the desk puts on a lead — "VIP", "испанский", "не звонить до 18".
 *
 * Deliberately freeform rather than a fixed vocabulary an admin maintains: the
 * things a desk needs to remember about a person are not knowable in advance,
 * and a closed list would just push them back into the comment thread where
 * nothing can filter on them. What keeps it from turning into noise is that
 * the filter above the table offers only tags actually in use, so a typo shows
 * up as its own lonely entry instead of hiding inside a free-text field.
 */
export function TagEditor({ leadId, tags }: { leadId: string; tags: string[] }) {
  const setTags = useSetLeadTags();
  const [draft, setDraft] = useState("");

  async function save(next: string[]) {
    try {
      await setTags.mutateAsync({ id: leadId, tags: next });
    } catch (e) {
      toast.error("Не удалось сохранить теги", e instanceof ApiError ? e.message : undefined);
    }
  }

  function add() {
    const value = draft.trim();
    if (!value) return;
    // Case-insensitive, same rule the server applies — better to refuse here
    // than to have the input clear and nothing appear.
    if (tags.some((t) => t.toLowerCase() === value.toLowerCase())) {
      setDraft("");
      return;
    }
    if (tags.length >= MAX_TAGS) {
      toast.error("Слишком много тегов", `Максимум ${MAX_TAGS}`);
      return;
    }
    setDraft("");
    void save([...tags, value]);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); add(); }
    // Backspace on an empty field removes the last tag — the behaviour every
    // tag input has, and the only way to fix a typo without reaching for the ×.
    if (e.key === "Backspace" && !draft && tags.length) void save(tags.slice(0, -1));
  }

  return (
    <div className="mb-4">
      <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-txt-2">Теги</div>
      <div
        className={classNames(
          "flex flex-wrap items-center gap-1.5 rounded-lg border border-line-soft bg-bg-2/30 p-2",
          setTags.isPending && "opacity-60"
        )}
      >
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-bg-3 py-0.5 pl-2 pr-1 text-2xs text-txt-1">
            {t}
            <button
              onClick={() => void save(tags.filter((x) => x !== t))}
              disabled={setTags.isPending}
              aria-label={`Убрать тег ${t}`}
              className="btn-fx rounded-full p-0.5 text-txt-3 hover:text-sell"
            >
              <IconClose size={9} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={add}
          maxLength={40}
          disabled={setTags.isPending}
          placeholder={tags.length ? "ещё тег…" : "VIP, испанский, не звонить до 18…"}
          className={fieldCls("sm", "min-w-[140px] flex-1 border-transparent bg-transparent")}
        />
      </div>
    </div>
  );
}
