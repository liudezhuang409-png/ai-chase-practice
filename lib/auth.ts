import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDemoUserFromCookie, isDemoModeEnabled } from "@/lib/demo";
import type { AppUser } from "@/lib/types";

export async function getAuthedUser(): Promise<AppUser | null> {
  const demoUser = await getDemoUserFromCookie();

  if (demoUser) {
    return demoUser;
  }

  if (isDemoModeEnabled()) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email ?? null,
    source: "supabase"
  };
}

export async function requireUser() {
  const user = await getAuthedUser();

  if (!user) {
    redirect("/");
  }

  return user;
}

export async function getApiUser() {
  const user = await getAuthedUser();

  if (!user) {
    throw new Error("UNAUTHORIZED");
  }

  return user;
}
