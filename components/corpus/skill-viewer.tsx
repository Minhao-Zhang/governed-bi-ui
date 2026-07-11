"use client";

/**
 * Skills viewer. Each skill is a governed prompt/playbook whose `body` is
 * markdown. No markdown renderer is installed (and this is a read/audit UI), so
 * we render the raw source in a monospace block that preserves line breaks —
 * faithful to what the engine stores, and easy to eyeball.
 */

import { Database } from "lucide-react";

import { useSkills } from "@/hooks/queries";
import { QueryState } from "@/components/common/query-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SkillView } from "@/lib/types";

export function SkillViewer() {
  const skills = useSkills();

  return (
    <QueryState
      query={skills}
      isEmpty={(data) => data.length === 0}
      emptyMessage="No skills defined."
    >
      {(data) => (
        <div className="space-y-4">
          {data.map((skill) => (
            <SkillCard key={skill.skill_id} skill={skill} />
          ))}
        </div>
      )}
    </QueryState>
  );
}

/** A single skill: id + kind badge + db header, then its markdown body. */
function SkillCard({ skill }: { skill: SkillView }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 font-mono">
          {skill.skill_id}
          <Badge variant="secondary">{skill.kind}</Badge>
          <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
            <Database className="size-3" />
            {skill.db}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Raw markdown source — line breaks preserved, no lib needed. */}
        <div className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-muted-foreground">
          {skill.body}
        </div>
      </CardContent>
    </Card>
  );
}
