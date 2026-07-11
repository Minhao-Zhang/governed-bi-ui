"use client";

/**
 * Corpus-health overview — the corpus-level audit view for `/health`.
 *
 * Reads the singleton `/health` snapshot via `useHealth()` and renders, top to
 * bottom, what a reviewer scans first:
 *   1. a CI status banner (calm when green, an alarm listing findings when not),
 *   2. a row of triage stat cards (the flags a reviewer checks first),
 *   3. the raw asset counts, and
 *   4. the verbatim finding strings (when any), in a mono box.
 *
 * Color always means trust level (globals.css): green = governed/clear,
 * amber = lineage/caution, red = refused/blocked. Every fetch state is handled
 * by the shared <QueryState>.
 */

import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  GraduationCap,
  Unlink,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useHealth } from "@/hooks/queries";
import type { CorpusHealth } from "@/lib/types";
import { QueryState } from "@/components/common/query-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function HealthOverview() {
  return (
    <QueryState
      query={useHealth()}
      emptyMessage="No corpus health data."
      skeleton={<HealthSkeleton />}
    >
      {(health) => (
        <div className="space-y-6">
          <CiBanner health={health} />
          <TriageRow health={health} />
          <AssetCounts counts={health.counts} />
          {health.findings.length > 0 && <FindingsBox findings={health.findings} />}
        </div>
      )}
    </QueryState>
  );
}

/* ── CI status banner ─────────────────────────────────────────────────────── */

/**
 * A single, unmissable read on whether the corpus is trustworthy right now:
 * a calm green card when CI passes, a red alarm listing the findings when not.
 */
function CiBanner({ health }: { health: CorpusHealth }) {
  if (health.ci_green) {
    return (
      <Card className="ring-tier-governed/30">
        <CardContent className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-tier-governed" />
          <div className="space-y-0.5">
            <p className="font-medium text-tier-governed">CI green</p>
            <p className="text-sm text-muted-foreground">
              All corpus checks pass. Nothing is flagged for review.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const n = health.findings.length;
  return (
    <Card className="ring-tier-refused/40">
      <CardContent className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-tier-refused" />
        <div className="min-w-0 space-y-2">
          <div className="space-y-0.5">
            <p className="font-medium text-tier-refused">CI not green</p>
            <p className="text-sm text-muted-foreground">
              {n > 0
                ? `${n} finding${n === 1 ? "" : "s"} need review before this corpus is trusted.`
                : "The corpus has not passed its checks."}
            </p>
          </div>
          {n > 0 && (
            <ul className="space-y-1">
              {health.findings.map((finding, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span
                    aria-hidden
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-tier-refused"
                  />
                  <span>{finding}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Triage stat cards ────────────────────────────────────────────────────── */

/** Accent tone for a flag count: red for correctness risks, amber for caution. */
type Tone = "refused" | "lineage";

const TONE_TEXT: Record<Tone, string> = {
  refused: "text-tier-refused",
  lineage: "text-tier-lineage",
};

/**
 * The flags a reviewer triages first. The three governance/reliability counts
 * light up (amber or red) when non-zero and stay muted at zero; `n_skills` is
 * informational and always neutral.
 */
function TriageRow({ health }: { health: CorpusHealth }) {
  return (
    <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard
        icon={AlertTriangle}
        label="Suspect columns"
        value={health.n_suspect_columns}
        tone="refused"
      />
      <StatCard
        icon={Ban}
        label="Excluded"
        value={health.n_excluded}
        tone="lineage"
      />
      <StatCard
        icon={Unlink}
        label="Low-confidence joins"
        value={health.n_low_confidence_joins}
        tone="refused"
      />
      <StatCard icon={GraduationCap} label="Skills" value={health.n_skills} />
    </section>
  );
}

/**
 * A single triage flag: a big number over a short label. When `tone` is set the
 * number turns amber/red once the count is above zero; a count of zero (or no
 * tone) reads as muted so the eye skips over what's clean.
 */
function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone?: Tone;
}) {
  const flagged = tone !== undefined && value > 0;
  return (
    <Card size="sm">
      <CardContent className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <div
            className={cn(
              "text-3xl font-semibold tabular-nums leading-none",
              flagged ? TONE_TEXT[tone] : "text-muted-foreground",
            )}
          >
            {value}
          </div>
          <div className="text-xs font-medium text-muted-foreground">{label}</div>
        </div>
        <Icon
          aria-hidden
          className={cn(
            "size-4 shrink-0",
            flagged ? TONE_TEXT[tone] : "text-muted-foreground/50",
          )}
        />
      </CardContent>
    </Card>
  );
}

/* ── Asset counts ─────────────────────────────────────────────────────────── */

/** Turn an asset-type key (`few_shot`) into a readable label (`few shot`). */
function humanize(key: string): string {
  return key.replace(/_/g, " ");
}

/**
 * The raw corpus inventory: one small chip per asset type. Keys are sorted so
 * the order is stable across renders and backends.
 */
function AssetCounts({ counts }: { counts: CorpusHealth["counts"] }) {
  const entries = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">Asset counts</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No assets in the corpus.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {entries.map(([key, count]) => (
            <div
              key={key}
              className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
            >
              <span className="font-mono tabular-nums font-medium">{count}</span>
              <span className="text-muted-foreground">{humanize(key)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ── Findings ─────────────────────────────────────────────────────────────── */

/** The verbatim finding strings, kept mono/small so they read as raw output. */
function FindingsBox({ findings }: { findings: string[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">Findings</h2>
      <div className="rounded-lg border bg-muted/30 p-4">
        <ul className="space-y-1.5 font-mono text-xs text-muted-foreground">
          {findings.map((finding, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="select-none text-tier-refused">
                !
              </span>
              <span className="break-words text-foreground">{finding}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ── Loading skeleton ─────────────────────────────────────────────────────── */

/** Mirrors the real layout (banner → 4 stat cards → chips) to avoid layout shift. */
function HealthSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-20 w-full" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24" />
        ))}
      </div>
    </div>
  );
}
