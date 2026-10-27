import "server-only";
import { sql } from "./db";
import { createUserToken, normalEmail, type User } from "./auth";
import { appUrl, emailEnabled, sendEmail } from "./email";
import { isRole } from "./roles";
import { ActionError, logActivity } from "./swaps";

export type InviteResult = { message: string; link: string; emailed: boolean };

function requireManagerOf(actor: User, target: { location_id: number } | undefined) {
  if (!actor.isManager) throw new ActionError("Only managers can manage staff.");
  if (!target || target.location_id !== actor.locationId) throw new ActionError("That person isn't on your staff list.");
}

export async function inviteStaff(
  actor: User,
  input: { name: string; email: string; role: string; isManager: boolean },
): Promise<InviteResult> {
  if (!actor.isManager) throw new ActionError("Only managers can invite staff.");
  const name = input.name.trim().slice(0, 80);
  const email = normalEmail(input.email);
  if (!name) throw new ActionError("Enter their name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ActionError("Enter a valid email address.");
  if (!isRole(input.role)) throw new ActionError("Pick their role.");
  const [existing] = await sql`SELECT 1 FROM users WHERE lower(email) = ${email} AND status <> 'removed'`;
  if (existing) throw new ActionError("Someone with that email already has an account.");
  const [user] = await sql`
    INSERT INTO users (location_id, name, email, role, is_manager, status)
    VALUES (${actor.locationId}, ${name}, ${email}, ${input.role}, ${input.isManager}, 'invited') RETURNING id`;
  await sql.begin((tx) => logActivity(tx, actor.locationId, `${actor.name} invited ${name} (${input.role.toLowerCase()}).`));
  return sendInvite(actor, user.id, name, email);
}

async function sendInvite(actor: User, userId: number, name: string, email: string): Promise<InviteResult> {
  const link = appUrl(`/welcome/${await createUserToken(userId, "invite")}`);
  await sendEmail(email, `${actor.name} invited you to ShiftChange`, [
    `Hi ${name}, ${actor.name} has added you to ShiftChange, where Vancouver Club staff give away and swap shifts.`,
    "Use the button below to set your password. The link works once and expires in 7 days.",
  ], { label: "Set my password", href: link });
  const emailed = emailEnabled();
  return { message: emailed ? `Invite emailed to ${email}.` : `Invite created for ${name}.`, link, emailed };
}

export async function resendInvite(actor: User, userId: number): Promise<InviteResult> {
  const [u] = await sql`SELECT * FROM users WHERE id = ${userId}`;
  requireManagerOf(actor, u as never);
  if (u.status !== "invited") throw new ActionError(`${u.name} has already set up their account.`);
  return sendInvite(actor, u.id, u.name, u.email);
}

// A manager can make a reset link for someone who's locked out.
export async function makeResetLink(actor: User, userId: number): Promise<InviteResult> {
  const [u] = await sql`SELECT * FROM users WHERE id = ${userId}`;
  requireManagerOf(actor, u as never);
  if (u.status !== "active") throw new ActionError("They haven't set up their account yet. Resend the invite instead.");
  return sendReset(u.id, u.name, u.email);
}

async function sendReset(userId: number, name: string, email: string): Promise<InviteResult> {
  const link = appUrl(`/reset/${await createUserToken(userId, "reset")}`);
  await sendEmail(email, "Reset your ShiftChange password", [
    `Hi ${name}, use the button below to choose a new password. The link works once and expires in 1 hour.`,
    "If you didn't ask for this, you can ignore this email.",
  ], { label: "Choose a new password", href: link });
  return { message: emailEnabled() ? `Reset link emailed to ${email}.` : `Reset link created for ${name}.`, link, emailed: emailEnabled() };
}

// "Forgot password" on the login screen. Always answers the same way so it can't be used
// to find out who has an account.
export async function requestReset(emailRaw: string) {
  const [u] = await sql`SELECT * FROM users WHERE lower(email) = ${normalEmail(emailRaw)} AND status = 'active'`;
  if (u && emailEnabled()) await sendReset(u.id, u.name, u.email);
}

export async function updateStaff(actor: User, userId: number, input: { role: string; isManager: boolean }) {
  const [u] = await sql`SELECT * FROM users WHERE id = ${userId}`;
  requireManagerOf(actor, u as never);
  if (!isRole(input.role)) throw new ActionError("Pick a role.");
  if (u.id === actor.id && !input.isManager) throw new ActionError("You can't remove your own manager access.");
  await sql`UPDATE users SET role = ${input.role}, is_manager = ${input.isManager} WHERE id = ${u.id}`;
  await sql.begin((tx) => logActivity(tx, actor.locationId, `${actor.name} updated ${u.name}'s role to ${input.role.toLowerCase()}${input.isManager ? " (manager)" : ""}.`));
  return `Saved ${u.name}'s details.`;
}

// Removing someone signs them out everywhere and clears their open requests.
export async function removeStaff(actor: User, userId: number) {
  const [u] = await sql`SELECT * FROM users WHERE id = ${userId}`;
  requireManagerOf(actor, u as never);
  if (u.id === actor.id) throw new ActionError("You can't remove yourself.");
  if (u.status === "removed") throw new ActionError(`${u.name} has already been removed.`);
  await sql.begin(async (tx) => {
    await tx`UPDATE users SET status = 'removed', removed_at = now() WHERE id = ${u.id}`;
    await tx`DELETE FROM sessions WHERE user_id = ${u.id}`;
    await tx`UPDATE user_tokens SET used_at = now() WHERE user_id = ${u.id} AND used_at IS NULL`;
    await tx`UPDATE offers SET status = 'withdrawn' WHERE post_id IN (SELECT id FROM posts WHERE poster_id = ${u.id} AND status IN ('open', 'pending')) AND status IN ('waiting', 'accepted')`;
    await tx`UPDATE posts SET status = 'cancelled', updated_at = now() WHERE poster_id = ${u.id} AND status IN ('open', 'pending')`;
    // If they'd agreed to take a shift that was waiting for approval, put it back on the board.
    await tx`UPDATE posts SET status = 'open', updated_at = now() WHERE id IN (SELECT post_id FROM offers WHERE from_id = ${u.id} AND status = 'accepted') AND status = 'pending'`;
    await tx`UPDATE offers SET status = 'withdrawn' WHERE from_id = ${u.id} AND status IN ('waiting', 'accepted')`;
    await tx`UPDATE post_recipients SET declined_at = now() WHERE user_id = ${u.id} AND declined_at IS NULL`;
    await logActivity(tx, actor.locationId, `${actor.name} removed ${u.name}. They can no longer sign in.`);
  });
  return `${u.name} can no longer sign in.`;
}

export async function setApproval(actor: User, required: boolean) {
  if (!actor.isManager) throw new ActionError("Only managers can change the rules.");
  await sql`UPDATE locations SET approval_required = ${required} WHERE id = ${actor.locationId}`;
  await sql.begin((tx) => logActivity(tx, actor.locationId, `${actor.name} turned manager approval ${required ? "on" : "off"}.`));
  return required ? "Managers now approve every change." : "Staff can now swap without approval, unless it's outside their role.";
}
