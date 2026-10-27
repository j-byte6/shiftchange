import { requireUser } from "@/lib/auth";
import { recentActivity } from "@/lib/queries";
import { timeAgo } from "@/lib/time";

export default async function ActivityPage() {
  const user = await requireUser();
  const items = await recentActivity(user.locationId);
  return (
    <>
      <div className="page-head">
        <h1>Recent activity</h1>
        <p className="lead">Everything that's happened lately, newest first.</p>
      </div>
      {items.length === 0 ? <div className="empty">Nothing yet.</div> : null}
      <ul className="log">
        {items.map((a, i) => (
          <li key={i}>
            <time dateTime={new Date(a.at).toISOString()}>{timeAgo(new Date(a.at))}</time>
            <span>{a.text}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
