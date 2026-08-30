import { useConvertLead } from "../../hooks/useCrm";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";
import { IconCheck, IconWarning } from "../icons/Icon";

/**
 * Turns a lead into a real platform account with one click. The server
 * generates the password; this button's only job is to hand it to the caller
 * once, via `onConverted` — it does not hold or display it itself, because
 * converting flips the card into showing the new account panel on the very
 * next refetch, which would unmount this component (and the password with
 * it) before anyone had a chance to read it. See RevealedPasswordBanner,
 * rendered by LeadCard at a point in the tree that survives that switch.
 */
export function ConvertLeadButton({
  leadId, hasEmail, onConverted,
}: {
  leadId: string;
  hasEmail: boolean;
  onConverted: (password: string) => void;
}) {
  const convert = useConvertLead();

  async function run() {
    try {
      const res = await convert.mutateAsync(leadId);
      onConverted(res.temporaryPassword);
    } catch (e) {
      toast.error("Не удалось создать аккаунт", e instanceof ApiError ? e.message : undefined);
    }
  }

  return (
    <div>
      <button
        onClick={run}
        disabled={!hasEmail || convert.isPending}
        title={!hasEmail ? "Нужен email — добавьте его в карточке" : undefined}
        className="btn-fx rounded-lg bg-accent-fill px-3 py-1.5 text-2xs font-semibold text-white hover:brightness-110 disabled:opacity-40"
      >
        {convert.isPending ? "Создание…" : "Перевести в пользователя платформы"}
      </button>
      {!hasEmail && (
        <div className="mt-1.5 flex items-center gap-1 text-2xs text-txt-3">
          <IconCheck size={11} className="opacity-0" /> Нужен email в карточке
        </div>
      )}
    </div>
  );
}

/**
 * The one-time reveal itself — a dismissible banner, not tied to whether the
 * card is currently showing the "convert" state or the "has an account"
 * state, so the password stays visible across that switch until the manager
 * explicitly acknowledges saving it.
 */
export function RevealedPasswordBanner({ password, onDismiss }: { password: string; onDismiss: () => void }) {
  return (
    <div className="mb-4 rounded-lg border border-warn/40 bg-warn/10 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-2xs font-semibold text-warn">
        <IconWarning size={13} /> Сохраните пароль — он больше нигде не будет показан
      </div>
      <div className="mb-2 flex items-center gap-2">
        <code className="mono flex-1 rounded-lg border border-line bg-bg-2 px-2 py-1.5 text-xs text-txt-0">{password}</code>
        <button
          onClick={() => { void navigator.clipboard?.writeText(password); toast.info("Пароль скопирован"); }}
          className="btn-fx rounded-lg border border-line px-2.5 py-1.5 text-2xs text-txt-1 hover:border-accent hover:text-accent"
        >
          Копировать
        </button>
      </div>
      <p className="mb-2 text-2xs text-txt-2">
        Передайте пароль клиенту тем же каналом, что и связь с ним. При первом входе система потребует
        заменить его на собственный.
      </p>
      <button onClick={onDismiss} className="btn-fx rounded-lg border border-line px-2.5 py-1 text-2xs text-txt-1 hover:text-txt-0">
        Я сохранил пароль
      </button>
    </div>
  );
}
