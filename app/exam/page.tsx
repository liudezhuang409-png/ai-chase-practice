import type { Route } from "next";
import { redirect } from "next/navigation";
export default function LegacyExamPage() { redirect("/mock-exams" as Route); }
