import Link from "next/link";
import { forgotAction } from "@/app/actions";
import { emailEnabled } from "@/lib/email";
import { AuthShell } from "@/components/AuthShell";
import { one, type Search } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ForgotPage({ searchParams }: { searchParams: Search }) {
  const q = await searchParams;
  if (!emailEnabled()) {
    return (
      <AuthShell title="Forgot your password?" lead="Ask a manager. They can send you a link to set a new one.">
        <p className="small"><Link href="/login">Back to sign in</Link></p>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Forgot your password?" lead="We'll email you a link to choose a new one.">
      {one(q.sent) ? (
        <p className="flash" role="status">If that email has an account, a link is on its way. It works for 1 hour.</p>
      ) : (
        <form action={forgotAction} className="form">
          <label className="field">
            <span>Email</span>
            <input type="email" name="email" autoComplete="email" required />
          </label>
          <button className="btn primary">Email me a link</button>
        </form>
      )}
      <p className="small"><Link href="/login">Back to sign in</Link></p>
    </AuthShell>
  );
}
