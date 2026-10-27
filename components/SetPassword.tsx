import Link from "next/link";
import { setPasswordAction } from "@/app/actions";
import { findUserToken, MIN_PASSWORD } from "@/lib/auth";
import { AuthShell } from "./AuthShell";
import { Flash } from "./ui";

// Shared by the invite ("welcome") and password reset links.
export async function SetPassword({ token, kind, err }: { token: string; kind: "invite" | "reset"; err?: string }) {
  const found = await findUserToken(token);
  if (!found || found.kind !== kind) {
    return (
      <AuthShell title="This link has expired" lead="Links work once and expire after a while. Ask a manager to send you a new one.">
        <p className="small"><Link href="/login">Go to sign in</Link></p>
      </AuthShell>
    );
  }
  return (
    <AuthShell
      title={kind === "invite" ? `Welcome, ${found.user.name.split(" ")[0]}` : "Choose a new password"}
      lead={kind === "invite" ? "Choose a password to finish setting up your account." : `For ${found.user.email}`}
    >
      <Flash err={err} />
      <form action={setPasswordAction} className="form">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="username" value={found.user.email} autoComplete="username" />
        <label className="field">
          <span>Password (at least {MIN_PASSWORD} characters)</span>
          <input type="password" name="password" minLength={MIN_PASSWORD} autoComplete="new-password" required />
        </label>
        <label className="field">
          <span>Type it again</span>
          <input type="password" name="confirm" minLength={MIN_PASSWORD} autoComplete="new-password" required />
        </label>
        <button className="btn primary">{kind === "invite" ? "Set password and sign in" : "Save and sign in"}</button>
      </form>
    </AuthShell>
  );
}
