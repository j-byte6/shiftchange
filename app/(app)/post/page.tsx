import { createPostAction } from "@/app/actions";
import { getLocation, requireUser } from "@/lib/auth";
import { teammates } from "@/lib/queries";
import { SECTIONS, sectionOf } from "@/lib/roles";
import { todayIn } from "@/lib/time";
import { Back, Flash, ShiftFields, one, type Search } from "@/components/ui";

export default async function PostPage({ searchParams }: { searchParams: Search }) {
  const user = await requireUser();
  const loc = await getLocation(user.locationId);
  const [people, q] = await Promise.all([teammates(user), searchParams]);
  return (
    <>
      <div className="page-head">
        <h1>Post a shift</h1>
        <p className="lead">Give a shift away, or offer to trade it for one of a teammate's.</p>
      </div>
      <Flash err={one(q.err)} />
      <form action={createPostAction} className="form post-form">
        <Back path="/post" />
        <fieldset>
          <legend>What do you want to do?</legend>
          <label className="choice">
            <input type="radio" name="kind" value="giveaway" defaultChecked />
            <span><strong>Give it away</strong><br /><span className="meta">Someone takes the shift. You don't take one back.</span></span>
          </label>
          <label className="choice">
            <input type="radio" name="kind" value="swap" />
            <span><strong>Swap it</strong><br /><span className="meta">Someone takes this shift and gives you one of theirs.</span></span>
          </label>
        </fieldset>

        <fieldset>
          <legend>The shift</legend>
          <ShiftFields minDate={todayIn(loc.timeZone)} role={user.role} />
        </fieldset>

        {user.isManager ? (
          <label className="choice">
            <input type="checkbox" name="cover" value="1" />
            <span><strong>This shift needs cover</strong><br /><span className="meta">Post it on behalf of the club, for example when someone has left. It can only be picked up, not swapped.</span></span>
          </label>
        ) : null}

        <label className="field">
          <span>Note for your team (optional)</span>
          <textarea name="note" maxLength={280} placeholder="For example: Happy to trade for any Sunday." />
        </label>

        <fieldset>
          <legend>Who should see it?</legend>
          <label className="choice">
            <input type="radio" name="audience" value="everyone" defaultChecked />
            <span><strong>Everyone at {loc.name}</strong><br /><span className="meta">It goes on the shift board, and people in the same role get an email.</span></span>
          </label>
          <label className="choice">
            <input type="radio" name="audience" value="selected" />
            <span><strong>Only people I pick</strong><br /><span className="meta">Ask one or more teammates directly. Only they see it, and the first to say yes gets it.</span></span>
          </label>
        </fieldset>

        <div className="people">
          <span className="eyebrow">Pick who to ask</span>
          {SECTIONS.map((s) => {
            const group = people.filter((p) => sectionOf(p.role).id === s.id);
            if (!group.length) return null;
            return (
              <div key={s.id} className="people-group">
                <span className="meta">{s.name}</span>
                <div className="people-list">
                  {group.map((p) => (
                    <label key={p.id} className="person" htmlFor={`to-${p.id}`}>
                      <input type="checkbox" name="to" value={p.id} id={`to-${p.id}`} />
                      <span>{p.name} <span className="meta">{p.role}</span></span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
          {people.length === 0 ? <span className="meta">There's nobody else on the staff list yet.</span> : null}
        </div>

        <div className="actions">
          <button className="btn primary">Post shift</button>
        </div>
      </form>
    </>
  );
}
