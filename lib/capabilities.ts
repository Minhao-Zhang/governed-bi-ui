/**
 * Capability helpers. Every optional UI affordance is gated on `/capabilities`
 * so the UI adapts to whatever the attached backend can actually do (handoff §4)
 * rather than assuming.
 */

import type { Capabilities } from "@/lib/types";

/** Editing affordances show only when the backend reports it can edit. */
export function canEdit(caps: Capabilities | undefined): boolean {
  return caps?.can_edit === true;
}

/** Live streaming chat (`useStream`) vs the non-streaming `/chat` fallback. */
export function canStream(caps: Capabilities | undefined): boolean {
  return caps?.can_stream === true;
}

/** Whether a real model is attached (drives NL narration vs compact render). */
export function hasLiveModel(caps: Capabilities | undefined): boolean {
  return caps?.has_live_model === true;
}

/**
 * D15: the backend can serve scopeable/paginated routes (`/schema/summary`,
 * `/schema/{id}`) and focus/radius-bounded graphs. `=== true` returns false when
 * the flag is absent (pre-D15 engine), which drives the fall-back-to-flat path.
 */
export function canScope(caps: Capabilities | undefined): boolean {
  return caps?.can_scope === true;
}

/** D15: server-ranked `GET /search` is available (else the client Fuse index). */
export function canSearch(caps: Capabilities | undefined): boolean {
  return caps?.can_search === true;
}
