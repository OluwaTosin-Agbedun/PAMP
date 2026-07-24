"use server";

import { signOut } from "@/lib/auth/auth";

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
