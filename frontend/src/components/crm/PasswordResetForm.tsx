import { FormEvent, useState } from "react";
import { useAdminResetPassword } from "../../hooks/useAdmin";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";

/**
 * ADMIN-only, same as in the old admin console: resetting someone else's
 * password is not one of the four grantable CRM powers, and stays that way
 * here too (see lib/crmPermissions.ts).
 */
export function PasswordResetForm({ userId }: { userId: string }) {
  const resetPassword = useAdminResetPassword();
  const [newPassword, setNewPassword] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (newPassword.length < 10) {
      toast.warning("Пароль должен быть не короче 10 символов");
      return;
    }
    try {
      await resetPassword.mutateAsync({ id: userId, newPassword });
      toast.success("Пароль сброшен");
      setNewPassword("");
    } catch (e) {
      toast.error("Не удалось сбросить пароль", e instanceof ApiError ? e.message : undefined);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-line-soft bg-bg-2/30 p-2.5">
      <div className="mb-1.5 text-2xs font-semibold text-txt-1">Сменить пароль</div>
      <input
        type="text"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        placeholder="Новый пароль (мин. 10 символов)"
        className="mb-1.5 w-full rounded border border-line bg-bg-2 px-2 py-1.5 text-2xs outline-none focus:border-accent"
      />
      <button
        type="submit"
        disabled={resetPassword.isPending || newPassword.length < 10}
        className="btn-fx rounded border border-line px-3 py-1.5 text-2xs font-medium text-txt-1 hover:border-accent hover:text-accent disabled:opacity-40"
      >
        {resetPassword.isPending ? "Сброс…" : "Сбросить пароль"}
      </button>
    </form>
  );
}
