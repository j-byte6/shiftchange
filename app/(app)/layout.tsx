import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { getLocation, requireUser } from "@/lib/auth";
import { countPendingApprovals, countWaitingOnMe } from "@/lib/queries";
import { Nav } from "@/components/Nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [loc, waiting, approvals] = await Promise.all([
    getLocation(user.locationId),
    countWaitingOnMe(user),
    user.isManager ? countPendingApprovals(user.locationId) : Promise.resolve(0),
  ]);
  const items = [
    { href: "/", label: "Board", count: waiting.asks },
    { href: "/mine", label: "My shifts", count: waiting.offers },
    { href: "/post", label: "Post" },
    ...(user.isManager
      ? [
          { href: "/approvals", label: "Approvals", count: approvals },
          { href: "/staff", label: "Staff" },
          { href: "/rules", label: "Rules" },
        ]
      : []),
    { href: "/activity", label: "Activity" },
  ];
  return (
    <>
      <header className="top">
        <div className="wrap">
          <div className="top-bar">
            <Link href="/" className="brand">
              <img src="/brand/monogram-light.png" alt="" width={24} height={36} />
              <span className="brand-name">
                {loc.name}
                <span className="brand-sub">ShiftChange</span>
              </span>
            </Link>
            <div className="who">
              <span className="who-name">{user.name} · </span>
              <form action={logoutAction}>
                <button className="linklike">{process.env.DEMO_MODE === "1" ? "Switch person" : "Sign out"}</button>
              </form>
            </div>
          </div>
          <Nav items={items} />
        </div>
      </header>
      <div className="wrap">
        <main>{children}</main>
      </div>
    </>
  );
}
