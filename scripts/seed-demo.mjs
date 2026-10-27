// Fills an empty database with made-up staff and shifts, for showing the app to someone.
// Usage: DATABASE_URL=... node scripts/seed-demo.mjs [--reset]
// --reset wipes everything first. Every sample account uses DEMO_PASSWORD (default below).
import bcrypt from "bcryptjs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL first.");
const password = process.env.DEMO_PASSWORD || "vancouver-demo";
const sql = postgres(url, { max: 1, onnotice: () => {} });

const day = (n) => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver" }).format(new Date());
  const d = new Date(today + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const ago = (hours) => new Date(Date.now() - hours * 36e5);

const staff = [
  ["Jordan Lee", "Manager", true],
  ["Maya Ross", "Server"],
  ["Leo Tran", "Server"],
  ["Ana Park", "Server"],
  ["Sam Okafor", "Host"],
  ["Priya Kaur", "Line cook"],
  ["Dev Mehta", "Line cook"],
  ["Luis Gomez", "Dishwasher"],
  ["Kai Walsh", "Bartender"],
  ["Rosa Garcia", "Bartender"],
  ["Tom Hill", "Barback"],
];

try {
  if (process.argv.includes("--reset")) {
    await sql`TRUNCATE locations, users, sessions, user_tokens, login_attempts, posts, post_recipients, offers, activity RESTART IDENTITY CASCADE`;
  }
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM users`;
  if (n > 0) {
    console.log("seed-demo: the database already has people in it. Use --reset to wipe it first.");
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);
  await sql.begin(async (tx) => {
    const [loc] = await tx`INSERT INTO locations (name, approval_required) VALUES ('The Vancouver Club', true) RETURNING id`;
    const id = {};
    for (const [name, role, mgr] of staff) {
      const email = name.split(" ")[0].toLowerCase() + "@demo.shiftchange.app";
      const [u] = await tx`
        INSERT INTO users (location_id, name, email, role, is_manager, status, password_hash)
        VALUES (${loc.id}, ${name}, ${email}, ${role}, ${!!mgr}, 'active', ${hash}) RETURNING id`;
      id[name.split(" ")[0]] = u.id;
    }
    const post = async (poster, date, start, end, role, kind, audience, note, hoursAgo, createdBy = poster) => {
      const [p] = await tx`
        INSERT INTO posts (location_id, poster_id, created_by, shift_date, start_time, end_time, role, kind, audience, note, created_at)
        VALUES (${loc.id}, ${poster}, ${createdBy}, ${date}, ${start}, ${end}, ${role}, ${kind}, ${audience}, ${note}, ${ago(hoursAgo)})
        RETURNING id`;
      return p.id;
    };
    const log = (text, hoursAgo) => tx`INSERT INTO activity (location_id, text, created_at) VALUES (${loc.id}, ${text}, ${ago(hoursAgo)})`;

    await post(id.Leo, day(3), "17:00", "23:00", "Server", "giveaway", "everyone", "Family thing out of town. Anyone want it?", 6);
    await log("Leo Tran posted a server shift to give away.", 6);

    const priya = await post(id.Priya, day(2), "15:00", "23:30", "Line cook", "swap", "everyone", "Can trade for any day shift this week.", 5);
    await tx`INSERT INTO offers (post_id, from_id, kind, swap_date, swap_start, swap_end, swap_role, created_at)
             VALUES (${priya}, ${id.Dev}, 'swap', ${day(4)}, '08:00', '15:00', 'Line cook', ${ago(2)})`;
    await log("Priya Kaur posted a line cook shift to swap.", 5);
    await log("Dev Mehta offered Priya Kaur a swap.", 2);

    const ana = await post(id.Ana, day(4), "11:00", "16:00", "Server", "giveaway", "selected", "Any chance you could take my lunch? I owe you one.", 3);
    await tx`INSERT INTO post_recipients (post_id, user_id) VALUES (${ana}, ${id.Maya}), (${ana}, ${id.Leo})`;
    await log("Ana Park asked Maya Ross, Leo Tran about a server shift.", 3);

    const kai = await post(id.Kai, day(5), "18:00", "02:00", "Bartender", "giveaway", "everyone", "", 8);
    await tx`UPDATE posts SET status = 'pending' WHERE id = ${kai}`;
    await tx`INSERT INTO offers (post_id, from_id, kind, status, needs_approval, created_at) VALUES (${kai}, ${id.Maya}, 'pickup', 'accepted', true, ${ago(1)})`;
    await log("Kai Walsh posted a bartender shift to give away.", 8);
    await log("Maya Ross's pickup for a bartender shift is waiting for a manager.", 1);

    await post(null, day(6), "16:00", "23:00", "Dishwasher", "giveaway", "everyone", "We're short in the dish pit. Anyone free?", 4, id.Jordan);
    await log("A manager posted a dishwasher shift that needs cover.", 4);
  });
  console.log(`seed-demo: added ${staff.length} sample people. They all use the password "${password}".`);
} finally {
  await sql.end();
}
