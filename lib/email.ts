// Sends email through Resend when RESEND_API_KEY is set. Without it, emails are only
// logged, and the screens that matter (invites, password resets) show the link instead.

export function emailEnabled() {
  // The demo uses made-up addresses, so it never sends real email.
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM) && process.env.DEMO_MODE !== "1";
}

export function appUrl(path = "") {
  // On Vercel, fall back to the project's main address when APP_URL isn't set.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  const base = (process.env.APP_URL || vercel || "http://localhost:3000").replace(/\/$/, "");
  return base + path;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function sendEmail(to: string | string[], subject: string, lines: string[], link?: { label: string; href: string }) {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!recipients.length) return;
  const text = [...lines, link ? `${link.label}: ${link.href}` : ""].filter(Boolean).join("\n\n");
  if (!emailEnabled()) {
    console.log(`[email not sent: no RESEND_API_KEY] to=${recipients.join(",")} subject=${subject}\n${text}`);
    return;
  }
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1c1a18;max-width:520px">
    ${lines.map((l) => `<p>${esc(l)}</p>`).join("")}
    ${link ? `<p><a href="${esc(link.href)}" style="display:inline-block;background:#1c1a18;color:#faf8f3;padding:10px 18px;text-decoration:none;border-radius:4px">${esc(link.label)}</a></p>` : ""}
    <p style="color:#7a7068;font-size:13px">ShiftChange for The Vancouver Club</p></div>`;
  // Send one email per person so addresses aren't shared between staff.
  await Promise.all(
    recipients.map(async (addr) => {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: process.env.EMAIL_FROM, to: addr, subject, text, html }),
        });
        if (!res.ok) console.error(`email to ${addr} failed: ${res.status} ${await res.text()}`);
      } catch (e) {
        console.error(`email to ${addr} failed`, e);
      }
    }),
  );
}
