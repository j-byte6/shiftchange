import { redirect } from "next/navigation";
import { setupAction } from "@/app/actions";
import { MIN_PASSWORD } from "@/lib/auth";
import { sql } from "@/lib/db";
import { AuthShell } from "@/components/AuthShell";
import { Flash, RoleSelect, one, type Search } from "@/components/ui";

export const dynamic = "force-dynamic";

// One-time setup for the first manager. Disappears once anyone has an account.
export default async function SetupPage({ searchParams }: { searchParams: Search }) {
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM users`;
  if (n > 0) redirect("/login");
  const q = await searchParams;
  return (
    <AuthShell title="Set up ShiftChange" lead="Create the first manager account. You'll invite everyone else from inside the app.">
      <Flash err={one(q.err)} />
      <form action={setupAction} className="form">
        <label className="field">
          <span>Setup code</span>
          <input type="password" name="code" required autoComplete="off" />
        </label>
        <label className="field">
          <span>Club name</span>
          <input type="text" name="location" defaultValue="The Vancouver Club" required />
        </label>
        <label className="field">
          <span>Your name</span>
          <input type="text" name="name" autoComplete="name" required />
        </label>
        <label className="field">
          <span>Your role</span>
          <RoleSelect value="Manager" />
        </label>
        <label className="field">
          <span>Your email</span>
          <input type="email" name="email" autoComplete="email" required />
        </label>
        <label className="field">
          <span>Password (at least {MIN_PASSWORD} characters)</span>
          <input type="password" name="password" minLength={MIN_PASSWORD} autoComplete="new-password" required />
        </label>
        <button className="btn primary">Create my account</button>
      </form>
    </AuthShell>
  );
}
