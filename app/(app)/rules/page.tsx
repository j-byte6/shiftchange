import { setApprovalAction } from "@/app/actions";
import { getLocation, requireManager } from "@/lib/auth";
import { Flash, one, type Search } from "@/components/ui";

export default async function RulesPage({ searchParams }: { searchParams: Search }) {
  const user = await requireManager();
  const [loc, q] = await Promise.all([getLocation(user.locationId), searchParams]);
  return (
    <>
      <div className="page-head">
        <h1>Rules</h1>
        <p className="lead">How shift changes work at {loc.name}.</p>
      </div>
      <Flash msg={one(q.msg)} err={one(q.err)} />
      <article className="card">
        <h3>Manager approval</h3>
        <p style={{ margin: 0 }}>
          {loc.approvalRequired
            ? "On. Every swap and pickup waits for a manager before it's final."
            : "Off. A swap or pickup is final as soon as both people agree."}
        </p>
        <form action={setApprovalAction} className="actions">
          <input type="hidden" name="required" value={loc.approvalRequired ? "0" : "1"} />
          <button className="btn">{loc.approvalRequired ? "Let staff swap without approval" : "Require manager approval"}</button>
        </form>
      </article>
      <article className="card">
        <h3>Different roles always need approval</h3>
        <p style={{ margin: 0 }}>
          Staff can take a shift outside their role, for example a server picking up a bartender shift. That always waits for a manager, even when approval is off.
        </p>
      </article>
    </>
  );
}
