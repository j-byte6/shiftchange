import "server-only";
import { sql } from "./db";
import type { User } from "./auth";
import { todayIn } from "./time";

export type BoardPost = {
  id: number;
  date: string;
  start: string;
  end: string;
  role: string;
  kind: "giveaway" | "swap";
  audience: "everyone" | "selected";
  note: string;
  status: string;
  createdAt: Date;
  posterId: number | null;
  posterName: string | null;
  posterRole: string | null;
  recipients: { id: number; name: string; declined: boolean }[];
  myOffer: { id: number; status: string } | null;
};

export async function boardPosts(user: User, timeZone: string): Promise<BoardPost[]> {
  const today = todayIn(timeZone);
  const rows = await sql`
    SELECT p.*, u.name AS poster_name, u.role AS poster_role,
      COALESCE((SELECT json_agg(json_build_object('id', r.user_id, 'name', ru.name, 'declined', r.declined_at IS NOT NULL) ORDER BY ru.name)
                FROM post_recipients r JOIN users ru ON ru.id = r.user_id WHERE r.post_id = p.id), '[]') AS recipients,
      (SELECT json_build_object('id', o.id, 'status', o.status) FROM offers o
        WHERE o.post_id = p.id AND o.from_id = ${user.id} AND o.status IN ('waiting', 'accepted') LIMIT 1) AS my_offer
    FROM posts p LEFT JOIN users u ON u.id = p.poster_id
    WHERE p.location_id = ${user.locationId} AND p.status = 'open' AND p.shift_date >= ${today}
      AND (p.audience = 'everyone' OR p.poster_id = ${user.id} OR ${user.isManager}
           OR EXISTS (SELECT 1 FROM post_recipients r WHERE r.post_id = p.id AND r.user_id = ${user.id} AND r.declined_at IS NULL))
    ORDER BY (p.audience = 'selected') DESC, p.shift_date, p.start_time`;
  return rows.map(toBoardPost);
}

function toBoardPost(r: Record<string, any>): BoardPost {
  return {
    id: r.id,
    date: r.shift_date,
    start: r.start_time,
    end: r.end_time,
    role: r.role,
    kind: r.kind,
    audience: r.audience,
    note: r.note,
    status: r.status,
    createdAt: r.created_at,
    posterId: r.poster_id,
    posterName: r.poster_name,
    posterRole: r.poster_role,
    recipients: r.recipients,
    myOffer: r.my_offer,
  };
}

export type OfferView = {
  id: number;
  kind: "pickup" | "swap";
  status: string;
  fromId: number;
  fromName: string;
  fromRole: string;
  swap: { date: string; start: string; end: string; role: string } | null;
};

function toOffer(o: Record<string, any>): OfferView {
  return {
    id: o.id,
    kind: o.kind,
    status: o.status,
    fromId: o.from_id,
    fromName: o.from_name,
    fromRole: o.from_role,
    swap: o.kind === "swap" ? { date: o.swap_date, start: o.swap_start.slice(0, 5), end: o.swap_end.slice(0, 5), role: o.swap_role } : null,
  };
}

// Shifts I've posted that are still in play, plus asks that everyone turned down.
export async function myPosts(user: User, timeZone: string) {
  const today = todayIn(timeZone);
  const rows = await sql`
    SELECT p.*,
      COALESCE((SELECT json_agg(json_build_object('id', r.user_id, 'name', ru.name, 'declined', r.declined_at IS NOT NULL) ORDER BY ru.name)
                FROM post_recipients r JOIN users ru ON ru.id = r.user_id WHERE r.post_id = p.id), '[]') AS recipients,
      COALESCE((SELECT json_agg(json_build_object('id', o.id, 'kind', o.kind, 'status', o.status, 'from_id', o.from_id,
                  'from_name', ou.name, 'from_role', ou.role, 'swap_date', o.swap_date, 'swap_start', o.swap_start,
                  'swap_end', o.swap_end, 'swap_role', o.swap_role) ORDER BY o.created_at)
                FROM offers o JOIN users ou ON ou.id = o.from_id
                WHERE o.post_id = p.id AND o.status IN ('waiting', 'accepted')), '[]') AS offers
    FROM posts p
    WHERE (p.poster_id = ${user.id} OR (p.poster_id IS NULL AND p.created_by = ${user.id})) AND p.shift_date >= ${today}
      AND (p.status IN ('open', 'pending')
           OR (p.status = 'cancelled' AND p.audience = 'selected' AND p.updated_at > now() - interval '3 days'
               AND NOT EXISTS (SELECT 1 FROM post_recipients r WHERE r.post_id = p.id AND r.declined_at IS NULL)))
    ORDER BY p.shift_date, p.start_time`;
  return rows.map((r) => ({ ...toBoardPost(r), offers: (r.offers as any[]).map(toOffer) }));
}

// Offers I've made that are still open.
export async function myOffers(user: User) {
  const rows = await sql`
    SELECT o.*, p.shift_date, p.start_time, p.end_time, p.role, pu.name AS poster_name
    FROM offers o JOIN posts p ON p.id = o.post_id LEFT JOIN users pu ON pu.id = p.poster_id
    WHERE o.from_id = ${user.id} AND o.status IN ('waiting', 'accepted') AND p.status IN ('open', 'pending')
    ORDER BY p.shift_date`;
  return rows.map((r) => ({
    id: r.id as number,
    kind: r.kind as "pickup" | "swap",
    status: r.status as string,
    posterName: (r.poster_name as string | null) ?? "A manager",
    shift: { date: r.shift_date as string, start: r.start_time as string, end: r.end_time as string, role: r.role as string },
  }));
}

export async function pendingApprovals(user: User) {
  const rows = await sql`
    SELECT o.*, ou.name AS from_name, ou.role AS from_role, p.shift_date, p.start_time, p.end_time, p.role,
           pu.name AS poster_name, pu.role AS poster_role
    FROM offers o JOIN posts p ON p.id = o.post_id JOIN users ou ON ou.id = o.from_id LEFT JOIN users pu ON pu.id = p.poster_id
    WHERE p.location_id = ${user.locationId} AND o.status = 'accepted' AND p.status = 'pending'
    ORDER BY p.shift_date, p.start_time`;
  return rows.map((r) => ({
    ...toOffer(r),
    posterName: r.poster_name as string | null,
    posterRole: r.poster_role as string | null,
    shift: { date: r.shift_date as string, start: r.start_time as string, end: r.end_time as string, role: r.role as string },
  }));
}

export async function countPendingApprovals(locationId: number) {
  const [{ n }] = await sql`
    SELECT count(*)::int AS n FROM offers o JOIN posts p ON p.id = o.post_id
    WHERE p.location_id = ${locationId} AND o.status = 'accepted' AND p.status = 'pending'`;
  return n as number;
}

// How many things are waiting on this person: direct asks and offers on their posts.
export async function countWaitingOnMe(user: User) {
  const [{ asks, offers }] = await sql`
    SELECT
      (SELECT count(*)::int FROM post_recipients r JOIN posts p ON p.id = r.post_id
        WHERE r.user_id = ${user.id} AND r.declined_at IS NULL AND p.status = 'open'
          AND NOT EXISTS (SELECT 1 FROM offers o WHERE o.post_id = p.id AND o.from_id = ${user.id} AND o.status = 'waiting')) AS asks,
      (SELECT count(*)::int FROM offers o JOIN posts p ON p.id = o.post_id
        WHERE p.poster_id = ${user.id} AND o.status = 'waiting' AND p.status = 'open') AS offers`;
  return { asks: asks as number, offers: offers as number };
}

export async function teammates(user: User) {
  const rows = await sql`
    SELECT id, name, role FROM users
    WHERE location_id = ${user.locationId} AND status = 'active' AND id <> ${user.id}
    ORDER BY name`;
  return rows as unknown as { id: number; name: string; role: string }[];
}

export async function staffList(user: User) {
  const rows = await sql`
    SELECT id, name, email, role, is_manager, status, created_at FROM users
    WHERE location_id = ${user.locationId} AND (status <> 'removed' OR removed_at > now() - interval '30 days')
    ORDER BY status = 'removed', name`;
  return rows.map((r) => ({
    id: r.id as number,
    name: r.name as string,
    email: r.email as string,
    role: r.role as string,
    isManager: r.is_manager as boolean,
    status: r.status as "invited" | "active" | "removed",
  }));
}

export async function recentActivity(locationId: number, limit = 40) {
  const rows = await sql`SELECT text, created_at FROM activity WHERE location_id = ${locationId} ORDER BY created_at DESC LIMIT ${limit}`;
  return rows.map((r) => ({ text: r.text as string, at: r.created_at as Date }));
}
