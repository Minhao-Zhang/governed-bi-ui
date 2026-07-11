"use client";

/**
 * /corpus — the corpus browser surface. Two tabs: an asset table (metrics,
 * terms, joins, rules, few-shots, negatives) and a skills viewer. Pure
 * read/audit; any editing affordance is gated on backend capabilities.
 */

import { PageShell } from "@/components/layout/page-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssetBrowser } from "@/components/corpus/asset-browser";
import { SkillViewer } from "@/components/corpus/skill-viewer";

export default function CorpusPage() {
  return (
    <PageShell
      title="Corpus"
      description="Metrics, terms, joins, rules, few-shots, negatives, and skills."
    >
      <Tabs defaultValue="assets">
        <TabsList>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="skills">Skills</TabsTrigger>
        </TabsList>
        <TabsContent value="assets" className="pt-2">
          <AssetBrowser />
        </TabsContent>
        <TabsContent value="skills" className="pt-2">
          <SkillViewer />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
