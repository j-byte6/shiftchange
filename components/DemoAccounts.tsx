import { loginAction } from "@/app/actions";
import { sql } from "@/lib/db";
import { sectionOf } from "@/lib/roles";

// Only shown when DEMO_MODE=1: one-tap sign-in as any sample person, so a viewer can try both sides.
export function demoMode() {
  return process.env.DEMO_MODE === "1";
}

export async function DemoAccounts() {
  const people = await sql`SELECT name, email, role, is_manager FROM users WHERE status = 'active' ORDER BY is_manager DESC, name LIMIT 20`;
  const password = process.env.DEMO_PASSWORD || "vancouver-demo";
  return (
    <div className="demo">
      <span className="eyebrow">Demo with made-up staff</span>
      <p className="small" style={{ margin: 0 }}>Tap anyone to sign in as them. Try one person posting a shift and another taking it, then approve it as the manager.</p>
      <div className="demo-list">
        {people.map((p) => (
          <form key={p.email} action={loginAction}>
            <input type="hidden" name="email" value={p.email} />
            <input type="hidden" name="password" value={password} />
            <button className="demo-person">
              <strong>{p.name}</strong>
              <span>{p.is_manager ? "Manager" : `${sectionOf(p.role).name} · ${p.role}`}</span>
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
