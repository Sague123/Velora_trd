import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { config } from "../config.js";
import { badRequest } from "./errors.js";
import { captureError } from "./monitoring.js";

/**
 * Private object storage for identity documents.
 *
 * The single rule this file exists to enforce: a passport scan or a selfie is
 * never reachable by URL. The bucket is private, the service-role key that can
 * read it lives only on the server, and the only way anything gets out is a
 * signed link that expires in minutes. What the database stores is an object
 * *path*, not a URL — the `*_url` column names in `kyc_submissions` are the
 * schema's wording, and are deliberately never populated with a public link.
 *
 * With no Supabase credentials configured the module reports itself unavailable
 * and KYC submission is refused outright. Accepting someone's passport and
 * having nowhere safe to put it is the one failure mode worth being loud about.
 */

let client: SupabaseClient | null = null;

export const storageConfigured = (): boolean =>
  !!config.supabaseUrl && !!config.supabaseServiceRoleKey;

function storage(): SupabaseClient {
  if (!storageConfigured()) {
    throw badRequest("STORAGE_NOT_CONFIGURED",
      "Загрузка документов недоступна: хранилище не настроено");
  }
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

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
 * Stores one image and returns its object path. The path carries a random
 * component so it cannot be guessed from a user id even if the bucket's
 * permissions were ever misconfigured — defence in depth behind the private
 * bucket, not instead of it.
 */
export async function uploadPrivateImage(userId: string, slot: string, dataUri: string): Promise<string> {
  const { bytes, contentType, ext } = decodeImageDataUri(dataUri);
  const path = `${userId}/${slot}-${crypto.randomBytes(12).toString("hex")}.${ext}`;
  const { error } = await storage().storage.from(config.kycBucket).upload(path, bytes, {
    contentType,
    upsert: false,
  });
  if (error) {
    captureError(error, { scope: "storage.upload", userId, extra: { slot, bucket: config.kycBucket } });
    throw badRequest("UPLOAD_FAILED", "Не удалось сохранить документ — попробуйте ещё раз");
  }
  return path;
}

/** A short-lived link for a reviewer. Returns null rather than throwing: one
 * unreadable object must not stop the rest of a submission from being shown. */
export async function signedUrlFor(path: string | null | undefined): Promise<string | null> {
  if (!path || !storageConfigured()) return null;
  const { data, error } = await storage().storage
    .from(config.kycBucket)
    .createSignedUrl(path, config.kycSignedUrlTtlSec);
  if (error) {
    captureError(error, { scope: "storage.sign", extra: { bucket: config.kycBucket } });
    return null;
  }
  return data?.signedUrl ?? null;
}

/** Best-effort cleanup — used when a submission fails partway through, so a
 * rejected upload does not leave someone's passport lying in the bucket. */
export async function removeObjects(paths: string[]): Promise<void> {
  const wanted = paths.filter(Boolean);
  if (wanted.length === 0 || !storageConfigured()) return;
  const { error } = await storage().storage.from(config.kycBucket).remove(wanted);
  if (error) captureError(error, { scope: "storage.remove", extra: { count: wanted.length } });
}
