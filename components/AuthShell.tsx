export function AuthShell({ title, lead, children }: { title: string; lead?: string; children: React.ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-head">
          <img src="/brand/crest-light.png" alt="The Vancouver Club crest" width={120} height={168} />
          <span className="eyebrow">ShiftChange</span>
          <h1>{title}</h1>
          {lead ? <p className="lead">{lead}</p> : null}
        </div>
        {children}
      </div>
    </div>
  );
}
