import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Identity documents on disk.
 *
 * Moving KYC storage from a private bucket to a directory trades one risk
 * for another: a bucket key cannot be talked into reading /etc/passwd, a
 * filesystem path can. The object paths come from our own database, but a
 * row is still data — so the refusal is pinned here rather than left to
 * read like it obviously holds.
 *
 * KYC_DIR has to be set before config.ts is imported, hence the dynamic
 * import below.
 */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "velora-kyc-test-"));
process.env.KYC_DIR = dir;
const { uploadPrivateImage, readPrivateImage, removeObjects, decodeImageDataUri } =
  await import("../src/lib/storage.js");

/** A 1x1 PNG, the smallest thing the decoder accepts. */
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("a document round-trips, and its path is unguessable", async () => {
  const objectPath = await uploadPrivateImage("user-1", "document-front", PNG);
  assert.match(objectPath, /^user-1\/document-front-[0-9a-f]{24}\.png$/);

  const read = await readPrivateImage(objectPath);
  assert.ok(read);
  assert.equal(read.contentType, "image/png");
  assert.ok(read.bytes.length > 0);
});

test("documents are written unreadable to anyone else", async () => {
  const objectPath = await uploadPrivateImage("user-2", "selfie", PNG);
  const mode = (await fsp.stat(path.join(dir, objectPath))).mode & 0o777;
  assert.equal(mode, 0o600);
  const dirMode = (await fsp.stat(path.join(dir, "user-2"))).mode & 0o777;
  assert.equal(dirMode, 0o700);
});

test("a path pointing outside the store is refused, not followed", async () => {
  const outside = path.join(dir, "..", "escaped.png");
  await fsp.writeFile(outside, Buffer.from("not a document"));
  try {
    for (const evil of ["../escaped.png", "user-1/../../escaped.png", "/etc/passwd", "user-1/..%2Fescaped.png"]) {
      assert.equal(await readPrivateImage(evil), null, `should refuse ${evil}`);
    }
    // And removal cannot be talked into deleting it either.
    await removeObjects(["../escaped.png"]);
    assert.ok(fs.existsSync(outside), "removeObjects must not reach outside the store");
  } finally {
    await fsp.rm(outside, { force: true });
  }
});

test("a user id that would escape the directory is stripped, not trusted", async () => {
  const objectPath = await uploadPrivateImage("../../etc", "selfie", PNG);
  assert.ok(!objectPath.includes(".."), objectPath);
  const full = path.resolve(dir, objectPath);
  assert.ok(full.startsWith(dir + path.sep), "upload escaped the store");
});

test("only the three image types a camera produces are accepted", () => {
  assert.throws(() => decodeImageDataUri("data:application/pdf;base64,AAAA"), /UNSUPPORTED|Поддерживаются/);
  assert.throws(() => decodeImageDataUri("data:image/svg+xml;base64,AAAA"), /UNSUPPORTED|Поддерживаются/);
  assert.throws(() => decodeImageDataUri("https://example.com/passport.png"), /INVALID|Ожидается/);
});

test("a missing document reads as absent rather than throwing", async () => {
  assert.equal(await readPrivateImage("user-9/selfie-000000000000000000000000.png"), null);
  assert.equal(await readPrivateImage(null), null);
});

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
