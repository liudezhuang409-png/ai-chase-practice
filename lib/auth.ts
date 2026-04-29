import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getAuthedUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return user;
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
