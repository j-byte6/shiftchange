import { SECTIONS } from "@/lib/roles";
import { formatDay, formatTime, shiftHours } from "@/lib/time";

export type Search = Promise<Record<string, string | string[] | undefined>>;

export function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export function Flash({ msg, err }: { msg?: string; err?: string }) {
  if (err) return <p className="flash err" role="alert">{err}</p>;
  if (msg) return <p className="flash" role="status">{msg}</p>;
  return null;
}

export function ShiftWhen({ date, start, end }: { date: string; start: string; end: string }) {
  return (
    <div>
      <div className="day">{formatDay(date)}</div>
      <div className="when">
        {formatTime(start)} to {formatTime(end)} · {shiftHours(start, end)}h
      </div>
    </div>
  );
}

// Role picker grouped by section.
export function RoleSelect({ name = "role", value, id }: { name?: string; value?: string; id?: string }) {
  return (
    <select name={name} id={id ?? name} defaultValue={value} required>
      {SECTIONS.map((s) => (
        <optgroup key={s.id} label={s.name}>
          {s.roles.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

// Date and time inputs for one shift.
export function ShiftFields({ minDate, role, prefix = "" }: { minDate: string; role?: string; prefix?: string }) {
  return (
    <>
      <div className="row">
        <label className="field">
          <span>Date</span>
          <input type="date" name="date" id={prefix + "date"} min={minDate} required />
        </label>
        <label className="field">
          <span>Role</span>
          <RoleSelect value={role} id={prefix + "role"} />
        </label>
      </div>
      <div className="row">
        <label className="field">
          <span>Starts</span>
          <input type="time" name="start" id={prefix + "start"} step={900} required />
        </label>
        <label className="field">
          <span>Ends</span>
          <input type="time" name="end" id={prefix + "end"} step={900} required />
        </label>
      </div>
    </>
  );
}

export function Back({ path }: { path: string }) {
  return <input type="hidden" name="back" value={path} />;
}
