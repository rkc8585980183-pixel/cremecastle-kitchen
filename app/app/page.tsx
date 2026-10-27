export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import DeptApp from "./DeptApp";

export default async function AppPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role === "Admin" || user.role === "Super Admin") redirect("/admin");
  return <DeptApp user={user} />;
}
