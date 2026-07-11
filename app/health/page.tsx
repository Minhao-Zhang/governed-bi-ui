import { PageShell } from "@/components/layout/page-shell";
import { HealthOverview } from "@/components/health/health-overview";

/**
 * `/health` — the corpus-level audit view. A Server Component shell around the
 * interactive <HealthOverview> (which fetches via React Query on the client).
 * Static route, no params.
 */
export default function HealthPage() {
  return (
    <PageShell
      title="Health"
      description="Corpus health, CI status, and the flags a reviewer triages first."
    >
      <HealthOverview />
    </PageShell>
  );
}
