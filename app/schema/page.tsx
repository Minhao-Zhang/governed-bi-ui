"use client";

/**
 * /schema — the semantic layer as a knowledge graph, plus a plain table browser.
 * Two tabs share one selection: clicking a graph node opens its detail sheet,
 * which reads from both the graph (`useGraph`) and the schema (`useSchema`).
 */

import { useState } from "react";

import { useGraph, useSchema } from "@/hooks/queries";
import { PageShell } from "@/components/layout/page-shell";
import { QueryState } from "@/components/common/query-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErDiagram } from "@/components/schema/er-diagram";
import { KnowledgeGraph } from "@/components/schema/knowledge-graph";
import { NodeDetailSheet } from "@/components/schema/node-detail-sheet";
import { TableBrowser } from "@/components/schema/table-browser";
import type { KnowledgeGraph as KnowledgeGraphType } from "@/lib/types";

const EMPTY_GRAPH: KnowledgeGraphType = { nodes: [], edges: [] };

export default function SchemaPage() {
  const graphQuery = useGraph();
  const schemaQuery = useSchema();

  // The selected node id lives here so both the graph and its detail sheet agree.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <PageShell
      title="Schema"
      description="Relationships and the semantic layer as a knowledge graph."
    >
      <Tabs defaultValue="relationships" className="gap-4">
        <TabsList>
          <TabsTrigger value="relationships">Relationships</TabsTrigger>
          <TabsTrigger value="graph">Semantic graph</TabsTrigger>
          <TabsTrigger value="tables">Tables</TabsTrigger>
        </TabsList>

        <TabsContent value="relationships">
          <ErDiagram onSelect={setSelectedId} />
        </TabsContent>

        <TabsContent value="graph">
          <QueryState
            query={graphQuery}
            isEmpty={(g) => g.nodes.length === 0}
            emptyMessage="No knowledge graph yet."
            skeleton={<Skeleton className="h-[70vh] w-full rounded-md" />}
          >
            {(graph) => <KnowledgeGraph graph={graph} onSelect={setSelectedId} />}
          </QueryState>
        </TabsContent>

        <TabsContent value="tables">
          <QueryState
            query={schemaQuery}
            isEmpty={(tables) => tables.length === 0}
            emptyMessage="No tables yet."
          >
            {(tables) => <TableBrowser tables={tables} />}
          </QueryState>
        </TabsContent>
      </Tabs>

      {/* Controlled by the selection above; reads whatever data has loaded. */}
      <NodeDetailSheet
        nodeId={selectedId}
        schema={schemaQuery.data ?? []}
        graph={graphQuery.data ?? EMPTY_GRAPH}
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </PageShell>
  );
}
