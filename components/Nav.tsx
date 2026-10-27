"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; count?: number };

export function Nav({ items }: { items: Item[] }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={path === i.href ? "page" : undefined}>
          {i.label}
          {i.count ? <span className="count">{i.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
