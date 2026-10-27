"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import {
  MIN_PASSWORD, checkSetupCode, endSession, hashPassword, logIn, normalEmail, requireManager, requireUser,
  startSession, usePasswordToken,
} from "@/lib/auth";
import * as swaps from "@/lib/swaps";
import * as staff from "@/lib/staff";
import { isRole } from "@/lib/roles";
import { tidy } from "@/lib/text";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => Number(f.get(k));

// Only allow going back to a page inside the app.
function backTo(f: FormData, fallback: string) {
  const b = str(f, "back");
  return b.startsWith("/") && !b.startsWith("//") ? b : fallback;
}

function withParam(path: string, key: string, value: string) {
  const url = new URL(path, "http://x");
  url.searchParams.delete("msg");
  url.searchParams.delete("err");
  url.searchParams.set(key, tidy(value));
  return url.pathname + url.search;
}

// Runs a change and returns to the page with a short message for the person.
async function act(back: string, fn: () => Promise<string>): Promise<never> {
  let target: string;
  try {
    target = withParam(back, "msg", await fn());
  } catch (e) {
    if (!(e instanceof swaps.ActionError)) throw e;
    target = withParam(back, "err", e.message);
  }
  revalidatePath("/", "layout");
  redirect(target);
}

// Sign in and out

export async function loginAction(f: FormData) {
  const result = await logIn(str(f, "email"), String(f.get("password") ?? ""));
  if (!result.ok) redirect(`/login?err=${encodeURIComponent(result.error)}&email=${encodeURIComponent(str(f, "email"))}`);
  redirect("/");
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}

export async function forgotAction(f: FormData) {
  await staff.requestReset(str(f, "email"));
  redirect("/forgot?sent=1");
}

export async function setPasswordAction(f: FormData) {
  const token = str(f, "token");
  const pw = String(f.get("password") ?? "");
  const back = `/${str(f, "kind") === "reset" ? "reset" : "welcome"}/${token}`;
  if (pw.length < MIN_PASSWORD) redirect(`${back}?err=${encodeURIComponent(`Use at least ${MIN_PASSWORD} characters.`)}`);
  if (pw !== String(f.get("confirm") ?? "")) redirect(`${back}?err=${encodeURIComponent("The two passwords don't match.")}`);
  const done = await usePasswordToken(token, pw);
  if (!done) redirect(`${back}?err=${encodeURIComponent("This link has expired or was already used. Ask a manager for a new one.")}`);
  redirect("/?msg=" + encodeURIComponent(tidy(`Welcome, ${done.user.name}. You're signed in.`)));
}

// First run: creates the club and its first manager. Only works while there are no users.
export async function setupAction(f: FormData) {
  const fail = (m: string) => redirect(`/setup?err=${encodeURIComponent(m)}`);
  if (!checkSetupCode(str(f, "code"))) fail("That setup code isn't right.");
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM users`;
  if (n > 0) redirect("/login");
  const name = str(f, "name"), email = normalEmail(str(f, "email")), pw = String(f.get("password") ?? "");
  const location = str(f, "location") || "The Vancouver Club";
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Enter your name and email.");
  if (pw.length < MIN_PASSWORD) fail(`Use a password of at least ${MIN_PASSWORD} characters.`);
  const role = isRole(str(f, "role")) ? str(f, "role") : "Manager";
  const hash = await hashPassword(pw);
  const userId = await sql.begin(async (tx) => {
    const [loc] = await tx`INSERT INTO locations (name) VALUES (${location}) RETURNING id`;
    const [u] = await tx`
      INSERT INTO users (location_id, name, email, role, is_manager, status, password_hash)
      VALUES (${loc.id}, ${name}, ${email}, ${role}, true, 'active', ${hash}) RETURNING id`;
    await swaps.logActivity(tx, loc.id, `${name} set up ShiftChange.`);
    return u.id as number;
  });
  await startSession(userId);
  redirect("/staff?msg=" + encodeURIComponent("You're set up. Invite your staff next."));
}

// Posting and swapping

export async function createPostAction(f: FormData) {
  const user = await requireUser();
  const audience = str(f, "audience") === "selected" ? "selected" : "everyone";
  await act(backTo(f, "/post"), async () => {
    const msg = await swaps.createPost(user, {
      date: str(f, "date"),
      start: str(f, "start"),
      end: str(f, "end"),
      role: str(f, "role"),
      kind: str(f, "kind") === "swap" ? "swap" : "giveaway",
      note: str(f, "note"),
      audience,
      recipientIds: f.getAll("to").map(Number).filter(Number.isInteger),
      forCover: str(f, "cover") === "1",
    });
    // Leave the form once it's posted.
    redirect("/mine?msg=" + encodeURIComponent(msg));
  });
}

export async function withdrawPostAction(f: FormData) {
  const user = await requireUser();
  await act(backTo(f, "/mine"), () => swaps.withdrawPost(user, num(f, "post")));
}

export async function declineAskAction(f: FormData) {
  const user = await requireUser();
  await act(backTo(f, "/"), () => swaps.declineAsk(user, num(f, "post")));
}

export async function pickUpAction(f: FormData) {
  const user = await requireUser();
  await act(backTo(f, "/"), () => swaps.pickUp(user, num(f, "post")));
}

export async function offerSwapAction(f: FormData) {
  const user = await requireUser();
  await act(backTo(f, "/"), () =>
    swaps.offerSwap(user, num(f, "post"), { date: str(f, "date"), start: str(f, "start"), end: str(f, "end"), role: str(f, "role") }),
  );
}

export async function acceptOfferAction(f: FormData) {
  const user = await requireUser();
  await act(backTo(f, "/mine"), () => swaps.acceptOffer(user, num(f, "offer")));
}

export async function declineOfferAction(f: FormData) {
  const user = await requireUser();
  await act(backTo(f, "/mine"), () => swaps.declineOffer(user, num(f, "offer")));
}

export async function withdrawOfferAction(f: FormData) {
  const user = await requireUser();
  await act(backTo(f, "/mine"), () => swaps.withdrawOffer(user, num(f, "offer")));
}

export async function approveAction(f: FormData) {
  const user = await requireManager();
  await act("/approvals", () => swaps.approve(user, num(f, "offer")));
}

export async function denyAction(f: FormData) {
  const user = await requireManager();
  await act("/approvals", () => swaps.deny(user, num(f, "offer")));
}

// Staff and rules (managers only)

function linkPage(result: staff.InviteResult) {
  const q = new URLSearchParams({ msg: tidy(result.message) });
  if (!result.emailed) q.set("link", result.link);
  return "/staff?" + q.toString();
}

// Invites and reset links go back to the staff page, showing the link when email isn't set up.
async function linkAction(fn: () => Promise<staff.InviteResult>): Promise<never> {
  let target: string;
  try {
    target = linkPage(await fn());
  } catch (e) {
    if (!(e instanceof swaps.ActionError)) throw e;
    target = "/staff?err=" + encodeURIComponent(e.message);
  }
  revalidatePath("/staff");
  redirect(target);
}

export async function inviteAction(f: FormData) {
  const user = await requireManager();
  await linkAction(() =>
    staff.inviteStaff(user, { name: str(f, "name"), email: str(f, "email"), role: str(f, "role"), isManager: str(f, "manager") === "1" }),
  );
}

export async function resendInviteAction(f: FormData) {
  const user = await requireManager();
  await linkAction(() => staff.resendInvite(user, num(f, "user")));
}

export async function resetLinkAction(f: FormData) {
  const user = await requireManager();
  await linkAction(() => staff.makeResetLink(user, num(f, "user")));
}

export async function updateStaffAction(f: FormData) {
  const user = await requireManager();
  await act("/staff", () => staff.updateStaff(user, num(f, "user"), { role: str(f, "role"), isManager: str(f, "manager") === "1" }));
}

export async function removeStaffAction(f: FormData) {
  const user = await requireManager();
  await act("/staff", () => staff.removeStaff(user, num(f, "user")));
}

export async function setApprovalAction(f: FormData) {
  const user = await requireManager();
  await act("/rules", () => staff.setApproval(user, str(f, "required") === "1"));
}
