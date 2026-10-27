"use client";

import { useState } from "react";

// Shows a one-time link with a copy button, for when email isn't set up.
export function CopyLink({ link, label }: { link: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="linkbox">
      <strong>{label}</strong>
      <span className="meta">Send this link to them by text or email. It only works once.</span>
      <input type="text" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Link" />
      <div className="actions">
        <button
          type="button"
          className="btn primary"
          onClick={() =>
            navigator.clipboard.writeText(link).then(
              () => setCopied(true),
              () => setCopied(false),
            )
          }
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
