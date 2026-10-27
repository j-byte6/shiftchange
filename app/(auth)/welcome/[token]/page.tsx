import { SetPassword } from "@/components/SetPassword";
import { one, type Search } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function WelcomePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Search }) {
  const { token } = await params;
  return <SetPassword token={token} kind="invite" err={one((await searchParams).err)} />;
}
