/**
 * React Query hooks over the custom-route client. Consumers are Client
 * Components. Keys are simple and stable so the whole app shares one cache.
 */

"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api-client";

export function useCapabilities() {
  return useQuery({ queryKey: ["capabilities"], queryFn: api.capabilities });
}

export function useHealth() {
  return useQuery({ queryKey: ["health"], queryFn: api.health });
}

export function useSchema() {
  return useQuery({ queryKey: ["schema"], queryFn: api.schema });
}

export function useGraph() {
  return useQuery({ queryKey: ["knowledge-graph"], queryFn: api.knowledgeGraph });
}

export function useAssets(type?: string) {
  return useQuery({ queryKey: ["assets", type ?? "all"], queryFn: () => api.assets(type) });
}

export function useSkills() {
  return useQuery({ queryKey: ["skills"], queryFn: api.skills });
}
