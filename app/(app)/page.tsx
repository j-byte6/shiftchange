import Link from "next/link";
import { declineAskAction, offerSwapAction, pickUpAction } from "@/app/actions";
import { getLocation, requireUser } from "@/lib/auth";
import { boardPosts, type BoardPost } from "@/lib/queries";
import { sectionOf } from "@/lib/roles";
import { timeAgo, todayIn } from "@/lib/time";
import { Back, Flash, ShiftFields, ShiftWhen, one, type Search } from "@/components/ui";
import type { User } from "@/lib/auth";

export default async function BoardPage({ searchParams }: { searchParams: Search }) {
  const user = await requireUser();
  const loc = await getLocation(user.locationId);
  const [posts, q] = await Promise.all([boardPosts(user, loc.timeZone), searchParams]);
  const today = todayIn(loc.timeZone);
  return (
    <>
      <div className="page-head">
        <span className="eyebrow">{loc.name}</span>
        <h1>Shift board</h1>
        <p className="lead">Shifts your teammates want to give away or swap. Taking a shift outside your role needs a manager's OK.</p>
      </div>
      <Flash msg={one(q.msg)} err={one(q.err)} />
      {posts.length === 0 ? (
        <div className="empty">
          Nothing on the board right now. <Link href="/post">Post a shift</Link> if you need cover.
        </div>
      ) : (
        <div className="list">
          {posts.map((p) => (
            <PostCard key={p.id} post={p} user={user} today={today} />
          ))}
        </div>
      )}
    </>
  );
}

function PostCard({ post: p, user, today }: { post: BoardPost; user: User; today: string }) {
  const askedMe = p.audience === "selected" && p.recipients.some((r) => r.id === user.id && !r.declined);
  const otherRole = p.role !== user.role;
  return (
    <article className={"card" + (askedMe ? " direct" : "")}>
      <div className="card-top">
        <ShiftWhen date={p.date} start={p.start} end={p.end} />
        <div className="chips">
          {p.posterId === null ? <span className="chip warn">Needs cover</span> : p.kind === "swap" ? <span className="chip warn">Wants a swap</span> : <span className="chip">Up for grabs</span>}
          {askedMe ? <span className="chip good">Asked you directly</span> : null}
          <span className="chip plain">{sectionOf(p.role).name} · {p.role}</span>
        </div>
      </div>
      <div className="meta">
        {p.posterId === null ? "Posted by a manager" : <>Posted by <strong>{p.posterName}</strong></>} · {timeAgo(new Date(p.createdAt))}
        {p.audience === "selected" && !askedMe ? <> · Sent to {p.recipients.map((r) => r.name).join(", ")}</> : null}
      </div>
      {p.note ? <p className="note">"{p.note}"</p> : null}
      {otherRole && p.posterId !== user.id && !user.isManager ? (
        <p className="meta">This is a {p.role.toLowerCase()} shift. You can still take it, but a manager will need to approve.</p>
      ) : null}
      <Actions post={p} user={user} askedMe={askedMe} today={today} />
    </article>
  );
}

function Actions({ post: p, user, askedMe, today }: { post: BoardPost; user: User; askedMe: boolean; today: string }) {
  if (p.posterId === user.id) return <p className="meta">This is your shift. Manage it under <Link href="/mine">My shifts</Link>.</p>;
  if (p.myOffer) return <div className="chips"><span className="chip warn">{p.myOffer.status === "accepted" ? "Waiting for a manager" : `Your offer is waiting on ${p.posterName ?? "a manager"}`}</span></div>;
  return (
    <>
      <div className="actions">
        <form action={pickUpAction}>
          <input type="hidden" name="post" value={p.id} />
          <Back path="/" />
          <button className={"btn" + (p.kind === "giveaway" ? " primary" : "")}>{p.kind === "swap" ? "Take it without swapping" : "Pick it up"}</button>
        </form>
        {askedMe ? (
          <form action={declineAskAction}>
            <input type="hidden" name="post" value={p.id} />
            <Back path="/" />
            <button className="btn quiet">I can't do it</button>
          </form>
        ) : null}
      </div>
      {p.posterId !== null ? (
        <details>
          <summary className={"btn" + (p.kind === "swap" ? " primary" : "")}>Offer a swap</summary>
          <form action={offerSwapAction} className="panel form">
            <input type="hidden" name="post" value={p.id} />
            <Back path="/" />
            <p className="meta">Which of your shifts would you give {p.posterName} in return?</p>
            <ShiftFields minDate={today} role={user.role} prefix={`o${p.id}-`} />
            <div className="actions">
              <button className="btn primary">Send swap offer</button>
            </div>
          </form>
        </details>
      ) : null}
    </>
  );
}
