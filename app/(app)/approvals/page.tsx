import { approveAction, denyAction } from "@/app/actions";
import { requireManager } from "@/lib/auth";
import { pendingApprovals } from "@/lib/queries";
import { formatShift } from "@/lib/time";
import { Flash, ShiftWhen, one, type Search } from "@/components/ui";

export default async function ApprovalsPage({ searchParams }: { searchParams: Search }) {
  const user = await requireManager();
  const [items, q] = await Promise.all([pendingApprovals(user), searchParams]);
  return (
    <>
      <div className="page-head">
        <h1>Waiting for approval</h1>
        <p className="lead">Both people have agreed. Nothing is final until you approve it.</p>
      </div>
      <Flash msg={one(q.msg)} err={one(q.err)} />
      {items.length === 0 ? <div className="empty">Nothing is waiting. When staff agree on a swap or pickup, it shows up here.</div> : null}
      <div className="list">
        {items.map((o) => {
          const crossRole = o.fromRole !== o.shift.role || (o.swap && o.posterRole && o.swap.role !== o.posterRole);
          return (
            <article key={o.id} className="card">
              <div className="card-top">
                <ShiftWhen date={o.shift.date} start={o.shift.start} end={o.shift.end} />
                <div className="chips">
                  <span className="chip warn">{o.swap ? "Swap" : "Pickup"}</span>
                  {crossRole ? <span className="chip warn">Different role</span> : null}
                  <span className="chip plain">{o.shift.role}</span>
                </div>
              </div>
              <p style={{ margin: 0 }}>
                {o.swap && o.posterName ? (
                  <>
                    <strong>{o.fromName}</strong> ({o.fromRole.toLowerCase()}) takes this shift from <strong>{o.posterName}</strong>, and {o.posterName} takes their{" "}
                    {o.swap.role.toLowerCase()} shift on {formatShift(o.swap)}.
                  </>
                ) : (
                  <>
                    <strong>{o.fromName}</strong> ({o.fromRole.toLowerCase()}) takes this shift
                    {o.posterName ? <> from <strong>{o.posterName}</strong></> : " (it needed cover)"}.
                  </>
                )}
              </p>
              <div className="actions">
                <form action={approveAction}>
                  <input type="hidden" name="offer" value={o.id} />
                  <button className="btn primary">Approve</button>
                </form>
                <form action={denyAction}>
                  <input type="hidden" name="offer" value={o.id} />
                  <button className="btn danger">Deny</button>
                </form>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
