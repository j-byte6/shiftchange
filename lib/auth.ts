import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "./db";

const SESSION_COOKIE = "sc_session";
const SESSION_DAYS = 30;
const INVITE_DAYS = 7;
const RESET_HOURS = 1;
const MAX_FAILED_LOGINS = 8; // per email, per 15 minutes

export type User = {
  id: number;
  locationId: number;
  name: string;
  email: string;
  role: string;
  isManager: boolean;
  status: "invited" | "active" | "removed";
};

export type Location = { id: number; name: string; timeZone: string; approvalRequired: boolean };

export const MIN_PASSWORD = 10;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");

export function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}

export function normalEmail(email: string) {
  return email.trim().toLowerCase();
}

export function checkSetupCode(given: string) {
  const expected = process.env.SETUP_CODE || "";
  if (!expected) return false;
  return timingSafeEqual(Buffer.from(hash(given)), Buffer.from(hash(expected)));
}

export function rowToUser(r: Record<string, unknown>): User {
  return {
    id: r.id as number,
    locationId: r.location_id as number,
    name: r.name as string,
    email: r.email as string,
    role: r.role as string,
    isManager: r.is_manager as boolean,
    status: r.status as User["status"],
  };
}

export async function startSession(userId: number) {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await sql`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (${hash(token)}, ${userId}, ${expires})`;
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Secure everywhere except a plain-http local copy.
    secure: !(process.env.APP_URL ?? "").startsWith("http://localhost"),
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await sql`DELETE FROM sessions WHERE token_hash = ${hash(token)}`;
  jar.delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await sql`
    SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${hash(token)} AND s.expires_at > now() AND u.status = 'active'`;
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireManager(): Promise<User> {
  const user = await requireUser();
  if (!user.isManager) redirect("/");
  return user;
}

export async function getLocation(id: number): Promise<Location> {
  const [r] = await sql`SELECT * FROM locations WHERE id = ${id}`;
  return { id: r.id, name: r.name, timeZone: r.time_zone, approvalRequired: r.approval_required };
}

// A real bcrypt hash of a random string, compared against when no account matches so that
// a wrong email takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync(randomBytes(16).toString("hex"), 12);

export type LoginResult = { ok: true } | { ok: false; error: string };

export async function logIn(emailRaw: string, password: string): Promise<LoginResult> {
  const email = normalEmail(emailRaw);
  const [{ count }] = await sql`
    SELECT count(*)::int AS count FROM login_attempts
    WHERE lower(email) = ${email} AND NOT succeeded AND created_at > now() - interval '15 minutes'`;
  if (count >= MAX_FAILED_LOGINS) {
    return { ok: false, error: "Too many attempts. Wait 15 minutes, or ask a manager to reset your password." };
  }
  const [row] = await sql`SELECT * FROM users WHERE lower(email) = ${email} AND status = 'active'`;
  const ok = await bcrypt.compare(password, (row?.password_hash as string) || DUMMY_HASH);
  await sql`INSERT INTO login_attempts (email, succeeded) VALUES (${email}, ${ok && !!row})`;
  if (!row || !ok) return { ok: false, error: "That email and password don't match." };
  await startSession(row.id);
  return { ok: true };
}

// Creates a single-use link token. Older unused tokens of the same kind stop working.
export async function createUserToken(userId: number, kind: "invite" | "reset") {
  const token = newToken();
  const expires = new Date(Date.now() + (kind === "invite" ? INVITE_DAYS * 864e5 : RESET_HOURS * 36e5));
  await sql`UPDATE user_tokens SET used_at = now() WHERE user_id = ${userId} AND kind = ${kind} AND used_at IS NULL`;
  await sql`INSERT INTO user_tokens (token_hash, user_id, kind, expires_at) VALUES (${hash(token)}, ${userId}, ${kind}, ${expires})`;
  return token;
}

export async function findUserToken(token: string) {
  const [row] = await sql`
    SELECT t.kind, u.* FROM user_tokens t JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = ${hash(token)} AND t.used_at IS NULL AND t.expires_at > now() AND u.status <> 'removed'`;
  return row ? { kind: row.kind as "invite" | "reset", user: rowToUser(row) } : null;
}

// Sets the password from an invite or reset link, activates the account, and signs the person in.
export async function usePasswordToken(token: string, password: string) {
  const found = await findUserToken(token);
  if (!found) return null;
  const pw = await hashPassword(password);
  await sql.begin(async (tx) => {
    await tx`UPDATE user_tokens SET used_at = now() WHERE token_hash = ${hash(token)}`;
    await tx`UPDATE users SET password_hash = ${pw}, status = 'active' WHERE id = ${found.user.id}`;
    // A new password signs out every other device.
    await tx`DELETE FROM sessions WHERE user_id = ${found.user.id}`;
  });
  await startSession(found.user.id);
  return found;
}
