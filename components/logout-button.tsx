"use client";

import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasConfiguredSupabasePublicEnv } from "@/lib/setup";

export function LogoutButton({ email }: { email: string }) {
  const router = useRouter();

  async function handleLogout() {
    if (!hasConfiguredSupabasePublicEnv({
      url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
    })) {
      await fetch("/api/demo/logout", {
        method: "POST"
      });
    } else {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    }

    router.refresh();
    router.push("/");
  }

  return (
    <button className="button button--ghost" onClick={handleLogout}>
      {email} · 退出
    </button>
  );
}
