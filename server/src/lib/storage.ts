import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../config.js";
import { badRequest } from "./errors.js";
import { captureError } from "./monitoring.js";

/**
 * Private storage for identity documents, on this machine's disk.
 *
 * The single rule this file exists to enforce: a passport scan or a selfie is
 * never reachable by URL. There is no signed link and no public bucket — the
 * bytes leave only through an authenticated API call that the reviewer's
 * session makes (see routes/admin.ts), so a copied address is worthless even
 * seconds later. What the database stores is a relative object *path*; the
 * `*_url` column names in `kyc_submissions` are the schema's wording and are
 * deliberately never populated with a link.
 *
 * The directory sits outside anything a web server serves, is created 0700,
 * and is shared by both processes: the public one writes when a client
 * submits, the internal one reads when an admin reviews. That is one of the
 * reasons the two run on the same host.
 *
 * If the directory cannot be created or written, the module reports itself
 * unavailable and KYC submission is refused outright. Accepting someone's
 * passport and having nowhere safe to put it is worth being loud about.
 */

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const EXT_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_EXT).map(([mime, ext]) => [ext, mime]),
);

/**
 * `<userId>/<slot>-<random>.<ext>` — the only shape this module ever writes.
 *
 * No dots in the directory segment, so `..` cannot be spelled at all: ids
 * here are UUIDs and never contain one. That makes traversal impossible by
 * construction rather than something the resolve check has to catch.
 */
const OBJECT_PATH = /^[A-Za-z0-9_-]+\/[A-Za-z0-9-]+\.(jpg|png|webp)$/;

const root = () => path.resolve(config.kycDir);

/**
 * Resolves a stored path inside the root, or throws.
 *
 * The paths come from our own database, so this is defence in depth rather
 * than input validation — but a row is still data, and `../../etc/passwd`
 * read back as an "object path" is exactly the mistake worth making
 * impossible rather than unlikely.
 */
function resolveObject(objectPath: string): string {
  if (!OBJECT_PATH.test(objectPath)) throw new Error(`refusing malformed object path: ${objectPath}`);
  const full = path.resolve(root(), objectPath);
  if (full !== root() && !full.startsWith(root() + path.sep)) {
    throw new Error("refusing object path outside the storage root");
  }
  return full;
}

let usable: boolean | null = null;

/** Whether documents can be stored at all. Checked once, then remembered. */
export function storageConfigured(): boolean {
  if (usable !== null) return usable;
  try {
    fs.mkdirSync(root(), { recursive: true, mode: 0o700 });
    fs.accessSync(root(), fs.constants.W_OK | fs.constants.R_OK);
    usable = true;
  } catch (e) {
    captureError(e, { scope: "storage.init", extra: { dir: root() } });
    usable = false;
  }
  return usable;
}

function requireStorage(): void {
  if (!storageConfigured()) {
    throw badRequest("STORAGE_NOT_CONFIGURED",
      "Загрузка документов недоступна: хранилище не настроено");
  }
}

/** Parses a `data:image/...;base64,...` URI into bytes, rejecting anything that
 * is not one of the three image types a phone camera actually produces. A PDF
 * or an SVG here would be a file we cannot render and, in SVG's case, a script
 * host — neither belongs in a document upload. */
export function decodeImageDataUri(dataUri: string): { bytes: Buffer; contentType: string; ext: string } {
  const match = /^data:([a-z/+-]+);base64,(.+)$/i.exec(dataUri.trim());
  if (!match) throw badRequest("INVALID_IMAGE", "Ожидается изображение в формате data:image/...;base64,");
  const contentType = match[1].toLowerCase();
  const ext = MIME_EXT[contentType];
  if (!ext) throw badRequest("UNSUPPORTED_IMAGE", "Поддерживаются только JPEG, PNG и WebP");

  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0) throw badRequest("INVALID_IMAGE", "Пустое изображение");
  if (bytes.length > config.kycMaxImageBytes) {
    throw badRequest("IMAGE_TOO_LARGE",
      `Файл больше ${Math.round(config.kycMaxImageBytes / 1024 / 1024)} МБ — уменьшите изображение`);
  }
  return { bytes, contentType, ext };
}

/**
 * Stores one image and returns its object path. The name carries a random
 * component so it cannot be guessed from a user id even if the directory's
 * permissions were ever loosened — defence in depth behind 0700, not instead
 * of it. Written 0600, and never overwriting: a fresh name every time.
 */
export async function uploadPrivateImage(userId: string, slot: string, dataUri: string): Promise<string> {
  requireStorage();
  const { bytes, ext } = decodeImageDataUri(dataUri);
  // The user id comes from a verified token and the slot from a fixed list,
  // but both land in a filesystem path — so neither is trusted to be safe.
  const safeUser = userId.replace(/[^A-Za-z0-9_-]/g, "");
  const safeSlot = slot.replace(/[^A-Za-z0-9-]/g, "");
  if (!safeUser || !safeSlot) throw new Error("refusing empty user or slot in object path");

  const objectPath = `${safeUser}/${safeSlot}-${crypto.randomBytes(12).toString("hex")}.${ext}`;
  const full = resolveObject(objectPath);
  try {
    await fsp.mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
    await fsp.writeFile(full, bytes, { mode: 0o600, flag: "wx" });
  } catch (e) {
    captureError(e, { scope: "storage.upload", userId, extra: { slot } });
    throw badRequest("UPLOAD_FAILED", "Не удалось сохранить документ — попробуйте ещё раз");
  }
  return objectPath;
}

/**
 * The bytes of one document, for a reviewer's authenticated request.
 *
 * Returns null rather than throwing when the object is missing or
 * unreadable: one lost file must not stop the rest of a submission from
 * being reviewed.
 */
export async function readPrivateImage(
  objectPath: string | null | undefined,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (!objectPath || !storageConfigured()) return null;
  try {
    const full = resolveObject(objectPath);
    const bytes = await fsp.readFile(full);
    const ext = path.extname(full).slice(1).toLowerCase();
    return { bytes, contentType: EXT_MIME[ext] ?? "application/octet-stream" };
  } catch (e) {
    // A deleted file is an expected state; anything else is worth reporting.
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      captureError(e, { scope: "storage.read" });
    }
    return null;
  }
}

/** Best-effort cleanup — used when a submission fails partway through, so a
 * rejected upload does not leave someone's passport lying on disk. */
export async function removeObjects(paths: string[]): Promise<void> {
  if (!storageConfigured()) return;
  for (const objectPath of paths.filter(Boolean)) {
    try {
      await fsp.unlink(resolveObject(objectPath));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
        captureError(e, { scope: "storage.remove" });
      }
    }
  }
}
