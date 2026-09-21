"use server";

import { redirect } from "next/navigation";
import { clearPortalSession } from "@/lib/portal/session";

export async function logoutPortalAction(): Promise<void> {
  await clearPortalSession();
  redirect("/portal/login");
}
