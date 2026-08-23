import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { db } from "../db.js";
import { forbidden, unauthorized } from "../lib/errors.js";
import type { AccessClaims } from "../lib/auth.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
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
});
