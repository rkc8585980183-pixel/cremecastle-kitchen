import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AdminApp from "./AdminApp";

export default async function AdminPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "Admin" && user.role !== "Super Admin") redirect("/app");
  return <AdminApp user={user} />;
}
