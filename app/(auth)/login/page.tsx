import Link from "next/link";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions";
import { currentUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { AuthShell } from "@/components/AuthShell";
import { Flash, one, type Search } from "@/components/ui";
import { DemoAccounts, demoMode } from "@/components/DemoAccounts";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Search }) {
  if (await currentUser()) redirect("/");
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM users`;
  if (n === 0) redirect("/setup");
  const q = await searchParams;
  return (
    <AuthShell title="Sign in" lead="Give away and swap shifts with your team.">
      <Flash err={one(q.err)} msg={one(q.msg)} />
      <form action={loginAction} className="form">
        <label className="field">
          <span>Email</span>
          <input type="email" name="email" autoComplete="email" defaultValue={one(q.email)} required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" name="password" autoComplete="current-password" required />
        </label>
        <button className="btn primary">Sign in</button>
      </form>
      <p className="small">
        <Link href="/forgot">Forgot your password?</Link>
      </p>
      <p className="small meta">New here? A manager sends you an invite by email.</p>
      {demoMode() ? <DemoAccounts /> : null}
    </AuthShell>
  );
}
