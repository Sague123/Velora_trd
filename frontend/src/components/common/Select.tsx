import { SelectHTMLAttributes } from "react";
import { classNames } from "../../lib/format";
import { fieldCls, type FieldSize } from "../../lib/ui";
import { IconChevron } from "../icons/Icon";

/**
 * A single-choice filter that looks like the multi-choice one beside it.
 *
 * The CRM's toolbar ran both: `MultiSelect` for Этап/Ответственный/Теги, and
 * a bare `<select>` for Аккаунт/Шаг/Клиент. Same size, same radius, same
 * tokens — and still visibly different, because a native select draws the
 * platform's own arrow, which on this dark toolbar read as a control from a
 * different application.
 *
 * So the element stays native — keyboard behaviour, the mobile wheel picker,
 * and screen-reader semantics are all things a div-based dropdown has to
 * reimplement and usually gets wrong — and only the arrow is replaced:
 * `appearance-none` removes the platform's, and the same `IconChevron`
 * MultiSelect uses is drawn over it, inheriting the control's own colour so
 * it tracks the active state and the theme for free.
 *
 * `active` mirrors MultiSelect's selected look, which is what tells a manager
 * at a glance which filters are actually narrowing the board.
 */
export function Select({
  size = "md", active, className, children, ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & { size?: FieldSize; active?: boolean }) {
  return (
    <div className={classNames("relative", className)}>
      <select
        {...props}
        className={classNames(
          fieldCls(size, "w-full appearance-none pr-7"),
          active && "border-accent/50 bg-accent-soft text-accent"
        )}
      >
        {children}
      </select>
      <IconChevron
        size={11}
        direction="down"
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 opacity-60"
      />
    </div>
  );
}
