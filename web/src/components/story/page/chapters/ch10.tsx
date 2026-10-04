/**
 * Ch10 — STUB written by the page foundation. The chapter's builder replaces
 * this file (storyboard §2, build plan §2). Keep the export name, the section
 * id and data-tone.
 */
import type { PlanInfo } from "@/api";

export function Ch10({ plans }: { plans: PlanInfo[] }) {
  void plans;
  return (
    <section id="pricing" data-tone="night" data-chapter="pricing" className="relative z-10 mx-auto max-w-6xl px-5 py-32 sm:px-8">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-[#D18A5A]">10 · Pricing</p>
      <h2 className="mt-3 max-w-[18ch] text-4xl font-semibold tracking-tight text-[#F2EDE8] sm:text-6xl">Free for now.</h2>
    </section>
  );
}
