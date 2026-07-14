import type { Route } from "next";
import { redirect } from "next/navigation";
export default function LegacyReviewPage() { redirect("/mistakes" as Route); }
