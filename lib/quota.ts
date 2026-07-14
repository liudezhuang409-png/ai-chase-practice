import { supabaseAdmin } from "@/lib/supabase/admin";
import { getDemoPlan, getDemoPracticeCount } from "@/lib/demo";
import type { UserPlan } from "@/lib/types";
import { startOfChinaDayIso } from "@/lib/utils";

export const FREE_DAILY_LIMIT = 3;

export async function getUserPlan(userId: string): Promise<UserPlan> {
  if (userId === "demo-user") {
    return getDemoPlan(userId);
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("plan")
    .eq("id", userId)
    .single();

  if (error || !data) {
    return "free";
  }

  return data.plan === "premium" ? "premium" : data.plan === "pro" ? "pro" : "free";
}

export async function getTodayPracticeCount(userId: string) {
  if (userId === "demo-user") {
    return getDemoPracticeCount(userId);
  }

  const { count, error } = await supabaseAdmin
    .from("practice_sessions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("question_payload->>source", "ai")
    .gte("generated_at", startOfChinaDayIso());

  if (error) {
    throw new Error("FAILED_TO_READ_PRACTICE_COUNT");
  }

  return count ?? 0;
}

export async function getPracticeQuotaSnapshot(userId: string) {
  const plan = await getUserPlan(userId);

  if (plan !== "free") {
    return {
      plan,
      todayCount: 0,
      remainingFreeQuota: null
    };
  }

  const todayCount = await getTodayPracticeCount(userId);
  const remainingFreeQuota = Math.max(FREE_DAILY_LIMIT - todayCount, 0);

  return {
    plan,
    todayCount,
    remainingFreeQuota
  };
}

export async function ensurePracticeQuota(userId: string) {
  const snapshot = await getPracticeQuotaSnapshot(userId);

  if (snapshot.plan === "free" && (snapshot.remainingFreeQuota ?? 0) <= 0) {
    throw new Error("FREE_LIMIT_REACHED");
  }

  return snapshot;
}
