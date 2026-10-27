import "server-only";
import { sql, type Tx } from "./db";
import type { User } from "./auth";
import { appUrl, sendEmail } from "./email";
import { isRole } from "./roles";
import { formatShift, isDate, isTime, todayIn } from "./time";
import { tidy } from "./text";

// A problem the person can fix; its message is shown to them as is.
export class ActionError extends Error {}

type Mail = { to: string[]; subject: string; lines: string[]; link?: { label: string; href: string } };

export type ShiftInput = { date: string; start: string; end: string; role: string };

export type PostInput = ShiftInput & {
  kind: "giveaway" | "swap";
  note: string;
  audience: "everyone" | "selected";
  recipientIds: number[];
  forCover: boolean; // manager posting a shift nobody owns yet
};

type PostRow = {
  id: number;
  location_id: number;
  poster_id: number | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  role: string;
  kind: "giveaway" | "swap";
  audience: "everyone" | "selected";
  status: "open" | "pending" | "done" | "cancelled";
};

type OfferRow = {
  id: number;
  post_id: number;
  from_id: number;
  kind: "pickup" | "swap";
  swap_date: string | null;
  swap_start: string | null;
  swap_end: string | null;
  swap_role: string | null;
  status: string;
};

const shiftOf = (p: PostRow) => ({ date: p.shift_date, start: p.start_time, end: p.end_time });
const swapShiftOf = (o: OfferRow) => ({ date: o.swap_date!, start: o.swap_start!, end: o.swap_end! });

function validateShift(s: ShiftInput, timeZone: string) {
  if (!isDate(s.date)) throw new ActionError("Pick the date of the shift.");
  if (!isTime(s.start) || !isTime(s.end)) throw new ActionError("Enter a start and end time.");
  if (s.start === s.end) throw new ActionError("The start and end time can't be the same.");
  if (!isRole(s.role)) throw new ActionError("Pick the role for this shift.");
  if (s.date < todayIn(timeZone)) throw new ActionError("That date has already passed.");
}

async function location(tx: Tx, id: number) {
  const [l] = await tx`SELECT * FROM locations WHERE id = ${id}`;
  return l as { id: number; name: string; time_zone: string; approval_required: boolean };
}

async function userById(tx: Tx, id: number) {
  const [u] = await tx`SELECT id, name, email, role, location_id, status FROM users WHERE id = ${id}`;
  return u as { id: number; name: string; email: string; role: string; location_id: number; status: string } | undefined;
}

async function managerEmails(tx: Tx, locationId: number) {
  const rows = await tx`SELECT email FROM users WHERE location_id = ${locationId} AND is_manager AND status = 'active'`;
  return rows.map((r) => r.email as string);
}

export async function logActivity(tx: Tx, locationId: number, text: string) {
  await tx`INSERT INTO activity (location_id, text) VALUES (${locationId}, ${tidy(text)})`;
}

async function lockPost(tx: Tx, actor: User, postId: number) {
  const [p] = await tx`SELECT * FROM posts WHERE id = ${postId} FOR UPDATE`;
  if (!p || p.location_id !== actor.locationId) throw new ActionError("That shift isn't available any more.");
  return p as PostRow;
}

async function lockOffer(tx: Tx, actor: User, offerId: number) {
  const [o] = await tx`SELECT * FROM offers WHERE id = ${offerId}`;
  if (!o) throw new ActionError("That offer isn't available any more.");
  const post = await lockPost(tx, actor, o.post_id);
  const [fresh] = await tx`SELECT * FROM offers WHERE id = ${offerId} FOR UPDATE`;
  return { post, offer: fresh as OfferRow };
}

// Can this person see the post on their board?
async function canSee(tx: Tx, actor: User, p: PostRow) {
  if (p.location_id !== actor.locationId) return false;
  if (p.audience === "everyone" || p.poster_id === actor.id || actor.isManager) return true;
  const [r] = await tx`SELECT declined_at FROM post_recipients WHERE post_id = ${p.id} AND user_id = ${actor.id}`;
  return Boolean(r && !r.declined_at);
}

// Taking a shift outside your own role always needs a manager, whatever the location's setting.
async function isCrossRole(tx: Tx, p: PostRow, o: OfferRow) {
  const from = await userById(tx, o.from_id);
  if (from!.role !== p.role) return true;
  if (o.kind === "swap" && p.poster_id) {
    const poster = await userById(tx, p.poster_id);
    if (poster!.role !== o.swap_role) return true;
  }
  return false;
}

function describe(p: PostRow) {
  return `${p.role.toLowerCase()} shift on ${formatShift(shiftOf(p))}`;
}

async function run(fn: (tx: Tx, mail: Mail[]) => Promise<string>) {
  const mail: Mail[] = [];
  const message = await sql.begin((tx) => fn(tx, mail));
  // Emails go out only once the change is saved.
  await Promise.all(mail.map((m) => sendEmail(m.to, m.subject, m.lines.map(tidy), m.link)));
  return tidy(message);
}

export function createPost(actor: User, input: PostInput) {
  return run(async (tx, mail) => {
    const loc = await location(tx, actor.locationId);
    validateShift(input, loc.time_zone);
    if (input.forCover && !actor.isManager) throw new ActionError("Only managers can post a shift that needs cover.");
    const note = input.note.trim().slice(0, 280);
    const posterId = input.forCover ? null : actor.id;
    const kind = input.forCover ? "giveaway" : input.kind;

    let recipients: { id: number; name: string; email: string }[] = [];
    if (input.audience === "selected") {
      const ids = [...new Set(input.recipientIds)].filter((id) => id !== actor.id);
      if (!ids.length) throw new ActionError("Pick at least one person to ask.");
      recipients = (await tx`
        SELECT id, name, email FROM users
        WHERE id IN ${tx(ids)} AND location_id = ${actor.locationId} AND status = 'active'`) as never;
      if (recipients.length !== ids.length) throw new ActionError("One of the people you picked can't be asked. Refresh and try again.");
    }

    if (posterId) {
      const [dupe] = await tx`
        SELECT 1 FROM posts WHERE poster_id = ${posterId} AND shift_date = ${input.date} AND start_time = ${input.start}
        AND status IN ('open', 'pending')`;
      if (dupe) throw new ActionError("You've already posted this shift.");
    }

    const [post] = await tx`
      INSERT INTO posts (location_id, poster_id, created_by, shift_date, start_time, end_time, role, kind, audience, note)
      VALUES (${actor.locationId}, ${posterId}, ${actor.id}, ${input.date}, ${input.start}, ${input.end}, ${input.role},
              ${kind}, ${input.audience}, ${note})
      RETURNING *`;
    for (const r of recipients) await tx`INSERT INTO post_recipients (post_id, user_id) VALUES (${post.id}, ${r.id})`;

    const what = describe(post as PostRow);
    const who = input.forCover ? "A manager" : actor.name;
    const link = { label: "Open ShiftChange", href: appUrl("/") };
    if (recipients.length) {
      await logActivity(tx, actor.locationId, `${actor.name} asked ${recipients.map((r) => r.name).join(", ")} about a ${what}.`);
      mail.push({
        to: recipients.map((r) => r.email),
        subject: `${actor.name} asked you to ${kind === "swap" ? "swap" : "take"} a shift`,
        lines: [`${actor.name} asked you directly about their ${what}.`, note ? `Their note: "${note}"` : "", "Only you and the other people they asked can see it."].filter(Boolean),
        link,
      });
      return `Sent to ${recipients.map((r) => r.name).join(", ")}. Only they can see it.`;
    }
    await logActivity(tx, actor.locationId, `${who} posted a ${what} ${kind === "swap" ? "to swap" : "to give away"}.`);
    // Let everyone in the same role know, since they're the people who can take it without extra approval.
    const sameRole = await tx`
      SELECT email FROM users WHERE location_id = ${actor.locationId} AND role = ${input.role} AND status = 'active' AND id <> ${actor.id}`;
    mail.push({
      to: sameRole.map((r) => r.email as string),
      subject: input.forCover ? `A ${input.role.toLowerCase()} shift needs cover` : `${actor.name} posted a shift`,
      lines: [`${who} posted a ${what} ${kind === "swap" ? "and wants to swap it" : "that's up for grabs"}.`, note ? `Note: "${note}"` : ""].filter(Boolean),
      link,
    });
    return "Posted to the shift board.";
  });
}

export function withdrawPost(actor: User, postId: number) {
  return run(async (tx) => {
    const p = await lockPost(tx, actor, postId);
    const own = p.poster_id === actor.id || (p.poster_id === null && actor.isManager);
    if (!own) throw new ActionError("Only the person who posted this can take it down.");
    if (p.status !== "open" && p.status !== "pending") throw new ActionError("This shift is already settled.");
    await tx`UPDATE posts SET status = 'cancelled', updated_at = now() WHERE id = ${p.id}`;
    await tx`UPDATE offers SET status = 'withdrawn' WHERE post_id = ${p.id} AND status IN ('waiting', 'accepted')`;
    await logActivity(tx, actor.locationId, `${actor.name} took their ${describe(p)} off the board.`);
    return "Taken off the board.";
  });
}

export function declineAsk(actor: User, postId: number) {
  return run(async (tx, mail) => {
    const p = await lockPost(tx, actor, postId);
    const [r] = await tx`SELECT * FROM post_recipients WHERE post_id = ${p.id} AND user_id = ${actor.id} AND declined_at IS NULL`;
    if (!r || p.status !== "open") throw new ActionError("This request isn't waiting on you.");
    await tx`UPDATE post_recipients SET declined_at = now() WHERE post_id = ${p.id} AND user_id = ${actor.id}`;
    const [{ left }] = await tx`SELECT count(*)::int AS left FROM post_recipients WHERE post_id = ${p.id} AND declined_at IS NULL`;
    const poster = p.poster_id ? await userById(tx, p.poster_id) : null;
    await logActivity(tx, actor.locationId, `${actor.name} can't take ${poster ? poster.name + "'s" : "the"} ${describe(p)}.`);
    if (left === 0) {
      await tx`UPDATE posts SET status = 'cancelled', updated_at = now() WHERE id = ${p.id}`;
      if (poster) {
        mail.push({
          to: [poster.email],
          subject: "Nobody you asked can take your shift",
          lines: [`Everyone you asked said they can't take your ${describe(p)}.`, "You can ask someone else, or post it for everyone."],
          link: { label: "Open ShiftChange", href: appUrl("/mine") },
        });
      }
    }
    return poster ? `We let ${poster.name} know.` : "Done.";
  });
}

export function pickUp(actor: User, postId: number) {
  return run(async (tx, mail) => {
    const p = await lockPost(tx, actor, postId);
    await checkCanOffer(tx, actor, p);
    const [offer] = await tx`
      INSERT INTO offers (post_id, from_id, kind) VALUES (${p.id}, ${actor.id}, 'pickup') RETURNING *`;
    const poster = p.poster_id ? await userById(tx, p.poster_id) : null;
    if (p.kind === "swap" && poster) {
      // They wanted a trade, so they get to decide whether a straight pickup is OK.
      await logActivity(tx, actor.locationId, `${actor.name} offered to take ${poster.name}'s ${describe(p)}.`);
      mail.push({
        to: [poster.email],
        subject: `${actor.name} can take your shift`,
        lines: [`${actor.name} offered to take your ${describe(p)} without a swap.`, "Accept or decline it in ShiftChange."],
        link: { label: "See the offer", href: appUrl("/mine") },
      });
      return `Offer sent to ${poster.name}.`;
    }
    return lockIn(tx, mail, actor, p, offer as OfferRow);
  });
}

export function offerSwap(actor: User, postId: number, give: ShiftInput) {
  return run(async (tx, mail) => {
    const p = await lockPost(tx, actor, postId);
    if (!p.poster_id) throw new ActionError("This shift needs cover, so it can't be swapped. Pick it up instead.");
    const loc = await location(tx, actor.locationId);
    validateShift(give, loc.time_zone);
    await checkCanOffer(tx, actor, p);
    await tx`
      INSERT INTO offers (post_id, from_id, kind, swap_date, swap_start, swap_end, swap_role)
      VALUES (${p.id}, ${actor.id}, 'swap', ${give.date}, ${give.start}, ${give.end}, ${give.role})`;
    const poster = (await userById(tx, p.poster_id))!;
    await logActivity(tx, actor.locationId, `${actor.name} offered ${poster.name} a swap for their ${describe(p)}.`);
    mail.push({
      to: [poster.email],
      subject: `${actor.name} offered you a swap`,
      lines: [`${actor.name} will take your ${describe(p)}.`, `In return they'd give you their ${give.role.toLowerCase()} shift on ${formatShift(give)}.`],
      link: { label: "See the offer", href: appUrl("/mine") },
    });
    return `Swap offer sent to ${poster.name}.`;
  });
}

async function checkCanOffer(tx: Tx, actor: User, p: PostRow) {
  if (p.status !== "open" || !(await canSee(tx, actor, p))) throw new ActionError("That shift isn't available any more.");
  if (p.poster_id === actor.id) throw new ActionError("This is your own shift.");
  const loc = await location(tx, actor.locationId);
  if (p.shift_date < todayIn(loc.time_zone)) throw new ActionError("That shift has already passed.");
  const [mine] = await tx`SELECT 1 FROM offers WHERE post_id = ${p.id} AND from_id = ${actor.id} AND status = 'waiting'`;
  if (mine) throw new ActionError("You've already made an offer on this shift.");
}

export function acceptOffer(actor: User, offerId: number) {
  return run(async (tx, mail) => {
    const { post, offer } = await lockOffer(tx, actor, offerId);
    if (post.poster_id !== actor.id) throw new ActionError("Only the person who posted this shift can accept offers.");
    if (offer.status !== "waiting" || post.status !== "open") throw new ActionError("That offer isn't available any more.");
    return lockIn(tx, mail, actor, post, offer);
  });
}

export function declineOffer(actor: User, offerId: number) {
  return run(async (tx, mail) => {
    const { post, offer } = await lockOffer(tx, actor, offerId);
    if (post.poster_id !== actor.id) throw new ActionError("Only the person who posted this shift can decline offers.");
    if (offer.status !== "waiting") throw new ActionError("That offer isn't waiting any more.");
    await tx`UPDATE offers SET status = 'declined', decided_at = now() WHERE id = ${offer.id}`;
    const from = (await userById(tx, offer.from_id))!;
    await logActivity(tx, actor.locationId, `${actor.name} declined ${from.name}'s offer.`);
    mail.push({ to: [from.email], subject: `${actor.name} declined your offer`, lines: [`${actor.name} said no to your offer for their ${describe(post)}.`] });
    return "Offer declined.";
  });
}

export function withdrawOffer(actor: User, offerId: number) {
  return run(async (tx) => {
    const { post, offer } = await lockOffer(tx, actor, offerId);
    if (offer.from_id !== actor.id) throw new ActionError("That isn't your offer.");
    if (offer.status !== "waiting" && offer.status !== "accepted") throw new ActionError("That offer is already settled.");
    await tx`UPDATE offers SET status = 'withdrawn', decided_at = now() WHERE id = ${offer.id}`;
    if (offer.status === "accepted" && post.status === "pending") {
      await tx`UPDATE posts SET status = 'open', updated_at = now() WHERE id = ${post.id}`;
    }
    await logActivity(tx, actor.locationId, `${actor.name} withdrew their offer on a ${describe(post)}.`);
    return "Offer withdrawn.";
  });
}

// Both sides have agreed. Send it to a manager if needed, or finish it now.
async function lockIn(tx: Tx, mail: Mail[], actor: User, p: PostRow, o: OfferRow) {
  await tx`UPDATE offers SET status = 'declined', decided_at = now() WHERE post_id = ${p.id} AND id <> ${o.id} AND status = 'waiting'`;
  const loc = await location(tx, p.location_id);
  const crossRole = await isCrossRole(tx, p, o);
  if (loc.approval_required || crossRole) {
    await tx`UPDATE offers SET status = 'accepted', needs_approval = true WHERE id = ${o.id}`;
    await tx`UPDATE posts SET status = 'pending', updated_at = now() WHERE id = ${p.id}`;
    const from = (await userById(tx, o.from_id))!;
    await logActivity(tx, p.location_id, `${from.name}'s ${o.kind === "swap" ? "swap" : "pickup"} for a ${describe(p)} is waiting for a manager.`);
    mail.push({
      to: await managerEmails(tx, p.location_id),
      subject: "A shift change needs your approval",
      lines: [`${from.name} is ${o.kind === "swap" ? "swapping for" : "taking"} a ${describe(p)}.${crossRole ? " This is outside their usual role." : ""}`],
      link: { label: "Review it", href: appUrl("/approvals") },
    });
    return crossRole ? "This is outside the usual role, so a manager needs to approve it." : "Sent to a manager for approval.";
  }
  await finish(tx, mail, p, o, null);
  return "Done. The shift is changed.";
}

async function finish(tx: Tx, mail: Mail[], p: PostRow, o: OfferRow, manager: User | null) {
  await tx`UPDATE offers SET status = 'approved', decided_by = ${manager?.id ?? null}, decided_at = now() WHERE id = ${o.id}`;
  await tx`UPDATE posts SET status = 'done', updated_at = now() WHERE id = ${p.id}`;
  const from = (await userById(tx, o.from_id))!;
  const poster = p.poster_id ? await userById(tx, p.poster_id) : null;
  const text = o.kind === "swap" && poster
    ? `${poster.name} and ${from.name} swapped: ${from.name} works the ${describe(p)}, and ${poster.name} works ${formatShift(swapShiftOf(o))}.`
    : `${from.name} is now working ${poster ? poster.name + "'s" : "the"} ${describe(p)}.`;
  await logActivity(tx, p.location_id, text + (manager ? ` Approved by ${manager.name}.` : ""));
  mail.push({ to: [from.email, poster?.email ?? ""], subject: "Your shift change is confirmed", lines: [text, "Please update any other schedule you use."] });
}

export function approve(actor: User, offerId: number) {
  return run(async (tx, mail) => {
    if (!actor.isManager) throw new ActionError("Only managers can approve changes.");
    const { post, offer } = await lockOffer(tx, actor, offerId);
    if (offer.status !== "accepted" || post.status !== "pending") throw new ActionError("This change isn't waiting for approval any more.");
    await finish(tx, mail, post, offer, actor);
    return "Approved.";
  });
}

export function deny(actor: User, offerId: number) {
  return run(async (tx, mail) => {
    if (!actor.isManager) throw new ActionError("Only managers can deny changes.");
    const { post, offer } = await lockOffer(tx, actor, offerId);
    if (offer.status !== "accepted" || post.status !== "pending") throw new ActionError("This change isn't waiting for approval any more.");
    await tx`UPDATE offers SET status = 'denied', decided_by = ${actor.id}, decided_at = now() WHERE id = ${offer.id}`;
    await tx`UPDATE posts SET status = 'open', updated_at = now() WHERE id = ${post.id}`;
    const from = (await userById(tx, offer.from_id))!;
    const poster = post.poster_id ? await userById(tx, post.poster_id) : null;
    await logActivity(tx, actor.locationId, `${actor.name} didn't approve ${from.name} taking the ${describe(post)}. It's back on the board.`);
    mail.push({
      to: [from.email, poster?.email ?? ""],
      subject: "A shift change wasn't approved",
      lines: [`${actor.name} didn't approve ${from.name} taking the ${describe(post)}.`, "The shift is back on the board, and nothing has changed on the schedule."],
    });
    return "Denied. The shift is back on the board.";
  });
}
