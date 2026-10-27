import { inviteAction, removeStaffAction, resendInviteAction, resetLinkAction, updateStaffAction } from "@/app/actions";
import { requireManager } from "@/lib/auth";
import { emailEnabled } from "@/lib/email";
import { staffList } from "@/lib/queries";
import { SECTIONS, sectionOf } from "@/lib/roles";
import { CopyLink } from "@/components/CopyLink";
import { Flash, RoleSelect, one, type Search } from "@/components/ui";

export default async function StaffPage({ searchParams }: { searchParams: Search }) {
  const user = await requireManager();
  const [people, q] = await Promise.all([staffList(user), searchParams]);
  const live = people.filter((p) => p.status !== "removed");
  const link = one(q.link);
  return (
    <>
      <div className="page-head">
        <h1>Staff</h1>
        <p className="lead">{live.length} people. Each has their own login. Invite new hires by email, and remove people the day they leave.</p>
      </div>
      <Flash msg={one(q.msg)} err={one(q.err)} />
      {link ? <CopyLink link={link} label={link.includes("/reset/") ? "Password reset link" : "Invite link"} /> : null}

      <details className="card" open={live.length <= 1}>
        <summary className="btn primary" style={{ justifySelf: "start" }}>Invite someone</summary>
        <form action={inviteAction} className="form" style={{ marginTop: 12 }}>
          <div className="row">
            <label className="field"><span>Name</span><input type="text" name="name" required maxLength={80} /></label>
            <label className="field"><span>Email</span><input type="email" name="email" required /></label>
          </div>
          <div className="row">
            <label className="field"><span>Role</span><RoleSelect id="invite-role" /></label>
          </div>
          <label className="person"><input type="checkbox" name="manager" value="1" /> Can approve swaps and manage staff</label>
          <p className="meta">
            {emailEnabled() ? "They'll get an email with a link to set their password." : "Email isn't set up yet, so you'll get a link to send them yourself."}
          </p>
          <div className="actions"><button className="btn primary">Send invite</button></div>
        </form>
      </details>

      {SECTIONS.map((s) => {
        const group = people.filter((p) => sectionOf(p.role).id === s.id);
        if (!group.length) return null;
        return (
          <section key={s.id} className="list">
            <div className="section-title"><h2>{s.name}</h2><span className="meta">{group.filter((p) => p.status !== "removed").length}</span></div>
            {group.map((p) => (
              <article key={p.id} className="card">
                <div className="staff-row">
                  <div>
                    <div className="staff-name">{p.name}{p.id === user.id ? " (you)" : ""}</div>
                    <div className="meta">{p.email}</div>
                  </div>
                  <div className="chips">
                    {p.status === "invited" ? <span className="chip warn">Invite sent</span> : p.status === "removed" ? <span className="chip plain">Removed</span> : null}
                    {p.isManager ? <span className="chip">Manager</span> : null}
                    <span className="chip plain">{p.role}</span>
                  </div>
                </div>
                {p.status !== "removed" ? (
                  <details>
                    <summary className="btn quiet">Manage</summary>
                    <div className="panel">
                      <form action={updateStaffAction} className="form">
                        <input type="hidden" name="user" value={p.id} />
                        <label className="field"><span>Role</span><RoleSelect value={p.role} id={`role-${p.id}`} /></label>
                        <label className="person"><input type="checkbox" name="manager" value="1" defaultChecked={p.isManager} /> Can approve swaps and manage staff</label>
                        <div className="actions"><button className="btn">Save</button></div>
                      </form>
                      <div className="actions">
                        {p.status === "invited" ? (
                          <form action={resendInviteAction}><input type="hidden" name="user" value={p.id} /><button className="btn">Send a new invite</button></form>
                        ) : (
                          <form action={resetLinkAction}><input type="hidden" name="user" value={p.id} /><button className="btn">Reset their password</button></form>
                        )}
                      </div>
                      {p.id !== user.id ? (
                        <details>
                          <summary className="btn danger">Remove {p.status === "invited" ? "invite" : "access"}</summary>
                          <form action={removeStaffAction} className="panel">
                            <input type="hidden" name="user" value={p.id} />
                            <p style={{ margin: 0 }}>Remove {p.name}? They'll be signed out and can't sign in again. Anything they posted or offered is cancelled.</p>
                            <div className="actions"><button className="btn danger">Yes, remove {p.name}</button></div>
                          </form>
                        </details>
                      ) : null}
                    </div>
                  </details>
                ) : null}
              </article>
            ))}
          </section>
        );
      })}
    </>
  );
}
