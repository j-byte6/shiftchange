import Link from "next/link";
import { acceptOfferAction, declineOfferAction, withdrawOfferAction, withdrawPostAction } from "@/app/actions";
import { getLocation, requireUser } from "@/lib/auth";
import { myOffers, myPosts } from "@/lib/queries";
import { formatShift } from "@/lib/time";
import { Back, Flash, ShiftWhen, one, type Search } from "@/components/ui";

export default async function MinePage({ searchParams }: { searchParams: Search }) {
  const user = await requireUser();
  const loc = await getLocation(user.locationId);
  const [posts, offers, q] = await Promise.all([myPosts(user, loc.timeZone), myOffers(user), searchParams]);
  return (
    <>
      <div className="page-head">
        <h1>My shifts</h1>
        <p className="lead">Shifts you've posted, and offers you've made on other people's.</p>
      </div>
      <Flash msg={one(q.msg)} err={one(q.err)} />

      <section className="list">
        <div className="section-title"><h2>I posted</h2><Link href="/post" className="meta">Post a shift</Link></div>
        {posts.length === 0 ? <div className="empty">You haven't posted any upcoming shifts.</div> : null}
        {posts.map((p) => {
          const turnedDown = p.status === "cancelled";
          const declined = p.recipients.filter((r) => r.declined).map((r) => r.name);
          return (
            <article key={p.id} className="card">
              <div className="card-top">
                <ShiftWhen date={p.date} start={p.start} end={p.end} />
                <div className="chips">
                  {turnedDown ? <span className="chip plain">Nobody could take it</span>
                    : p.status === "pending" ? <span className="chip warn">Waiting for a manager</span>
                    : p.audience === "selected" ? <span className="chip">Asked {p.recipients.map((r) => r.name).join(", ")}</span>
                    : <span className="chip">On the board</span>}
                  {p.posterId === null ? <span className="chip warn">Needs cover</span> : null}
                  <span className="chip plain">{p.role}</span>
                </div>
              </div>
              {declined.length && !turnedDown ? <p className="meta">{declined.join(", ")} can't take it.</p> : null}
              {turnedDown ? (
                <p className="meta">Everyone you asked said no. <Link href="/post">Ask someone else or post it for everyone.</Link></p>
              ) : null}
              {p.offers.map((o) => (
                <div key={o.id} className="offer">
                  <div>
                    <strong>{o.fromName}</strong>{" "}
                    {o.swap ? <>offers their <strong>{o.swap.role.toLowerCase()} shift on {formatShift(o.swap)}</strong> in return.</> : "wants to take it."}
                    {o.fromRole !== p.role ? <span className="meta"> They're a {o.fromRole.toLowerCase()}, so a manager will need to approve.</span> : null}
                  </div>
                  {o.status === "waiting" ? (
                    <div className="actions">
                      <form action={acceptOfferAction}>
                        <input type="hidden" name="offer" value={o.id} />
                        <Back path="/mine" />
                        <button className="btn primary">Accept</button>
                      </form>
                      <form action={declineOfferAction}>
                        <input type="hidden" name="offer" value={o.id} />
                        <Back path="/mine" />
                        <button className="btn quiet">Decline</button>
                      </form>
                    </div>
                  ) : (
                    <p className="meta">You've agreed. Waiting for a manager to approve.</p>
                  )}
                </div>
              ))}
              {p.status === "open" ? (
                <div className="actions">
                  <form action={withdrawPostAction}>
                    <input type="hidden" name="post" value={p.id} />
                    <Back path="/mine" />
                    <button className="btn danger">{p.audience === "selected" ? "Cancel request" : "Take it off the board"}</button>
                  </form>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>

      <section className="list">
        <div className="section-title"><h2>My offers</h2></div>
        {offers.length === 0 ? <div className="empty">You haven't offered to take any shifts. Browse the <Link href="/">shift board</Link>.</div> : null}
        {offers.map((o) => (
          <article key={o.id} className="card">
            <div className="card-top">
              <ShiftWhen date={o.shift.date} start={o.shift.start} end={o.shift.end} />
              <div className="chips">
                <span className="chip warn">{o.status === "accepted" ? "Waiting for a manager" : `Waiting on ${o.posterName}`}</span>
                <span className="chip plain">{o.shift.role}</span>
              </div>
            </div>
            <p className="meta">{o.posterName}'s shift · you offered {o.kind === "swap" ? "a swap" : "to take it"}</p>
            <div className="actions">
              <form action={withdrawOfferAction}>
                <input type="hidden" name="offer" value={o.id} />
                <Back path="/mine" />
                <button className="btn quiet">Withdraw my offer</button>
              </form>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
