import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { db } from "../db.js";
import { forbidden, unauthorized } from "../lib/errors.js";
import type { AccessClaims } from "../lib/auth.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireManager: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

// The JWT payload shape is declared where @fastify/jwt expects it, so
// req.user is strongly typed everywhere without casting.
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AccessClaims;
    user: AccessClaims;
  }
}

export default fp(async function authPlugin(app: FastifyInstance) {
  const getUser = db.prepare("SELECT status, role FROM users WHERE id = ?");

  app.decorate("authenticate", async (req: FastifyRequest) => {
    try {
      await req.jwtVerify();
    } catch {
      throw unauthorized("Недействительный или истёкший токен");
    }
    // The half-authenticated token handed out between password and TOTP code
    // is signed with the same key as an access token, so it must be rejected
    // explicitly here — otherwise a correct password alone would be enough to
    // reach every authenticated route, and 2FA would be decorative.
    if ((req.user as unknown as { mfa?: boolean }).mfa === true) {
      throw unauthorized("Требуется подтверждение второго фактора");
    }
    // Same reasoning, for the challenge issued to an account the CRM created
    // on someone's behalf: it proves nothing but possession of a temporary
    // password, and must not reach anywhere a real session could.
    if ((req.user as unknown as { pwd?: boolean }).pwd === true) {
      throw unauthorized("Требуется установить постоянный пароль");
    }
    // A suspended account loses access immediately, not at token expiry.
    const row = (await getUser.get(req.user.sub)) as { status: string; role: string } | undefined;
    if (!row) throw unauthorized("Пользователь не найден");
    if (row.status !== "ACTIVE") throw forbidden("Аккаунт заблокирован");
    req.user.role = row.role; // trust the database over the token claim
  });

  app.decorate("requireAdmin", async (req: FastifyRequest, reply: FastifyReply) => {
    await app.authenticate(req, reply);
    if (req.user.role !== "ADMIN") throw forbidden("Требуются права администратора");
  });

  /**
   * CRM access. Sales managers need the lead pipeline and nothing else — not
   * balance adjustments, not force-closing positions, not other people's KYC
   * documents. Admins are included because an admin who cannot see the CRM
   * would just be given a second account, which is worse.
   *
   * Note this is deliberately not a hierarchy check like `role >= MANAGER`:
   * MANAGER is not a weaker ADMIN, it is a different job, and the two grant
   * disjoint powers apart from this one overlap.
   */
  app.decorate("requireManager", async (req: FastifyRequest, reply: FastifyReply) => {
    await app.authenticate(req, reply);
    if (req.user.role !== "MANAGER" && req.user.role !== "ADMIN") {
      throw forbidden("Требуются права менеджера");
    }
  });
});
