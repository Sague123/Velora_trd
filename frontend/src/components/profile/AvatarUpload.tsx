import { useRef, useState } from "react";
import { useAuthStore } from "../../store/auth";
import { useUpdateProfile } from "../../hooks/useProfile";
import { compressImageToSquare } from "../../lib/image";
import { classNames } from "../../lib/format";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";
import { IconCamera } from "../icons/Icon";

export function AvatarUpload({ size = 64 }: { size?: number }) {
  const user = useAuthStore((s) => s.user);
  const refreshMe = useAuthStore((s) => s.refreshMe);
  const updateProfile = useUpdateProfile();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.warning("Выберите файл изображения");
    setBusy(true);
    try {
      const dataUri = await compressImageToSquare(file);
      await updateProfile.mutateAsync({ avatar: dataUri });
      await refreshMe();
      toast.success("Фото профиля обновлено");
    } catch (err) {
      toast.error("Не удалось загрузить фото", err instanceof ApiError ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      disabled={busy}
      className="btn-fx group relative shrink-0 rounded-full disabled:opacity-60"
      style={{ width: size, height: size }}
      title="Изменить фото профиля"
    >
      {user?.avatar ? (
        <img src={user.avatar} alt="" className="h-full w-full rounded-full object-cover ring-2 ring-line" style={{ width: size, height: size }} />
      ) : (
        <span
          className={classNames(
            "flex h-full w-full items-center justify-center rounded-full font-semibold ring-2 ring-line",
            user?.role === "ADMIN" ? "bg-warn/20 text-warn" : "bg-gradient-to-br from-accent to-[#7c3aed] text-white"
          )}
          style={{ fontSize: size * 0.36 }}
        >
          {user?.name?.[0]?.toUpperCase() ?? "?"}
        </span>
      )}
      <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
        {busy ? "…" : <IconCamera size={Math.round(size * 0.32)} />}
      </span>
      <input ref={inputRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
    </button>
  );
}
