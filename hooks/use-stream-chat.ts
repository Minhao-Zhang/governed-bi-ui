"use client";

/**
 * useStreamChat — the live streaming transport.
 *
 * Backs onto the engine's shipped LangGraph runtime via the LangChain
 * `useStream` hook (`@langchain/langgraph-sdk/react`) pointed at LANGGRAPH_URL +
 * ASSISTANT_ID. Only mounted when `/capabilities` reports `can_stream: true`.
 *
 * The serve graph is a single `answer` node that emits custom stage events
 * (`{ stage: "route" | "retrieve" | … }`) as it works; we map each to a UI stage
 * through `nodeToStage` so the StageStepper reflects real backend progress, never
 * a timer. The terminal AnswerView prefers `stream.values.answer` (handoff §3);
 * per-message `additional_kwargs.governed_bi` remains a fallback for older stamps.
 */

import { useRef, useState } from "react";
import { useStream } from "@langchain/langgraph-sdk/react";
import { toast } from "sonner";

import type { ChatMessage, ChatTransport } from "@/hooks/use-chat";
import { useRestChat } from "@/hooks/use-rest-chat";
import { ASSISTANT_ID, LANGGRAPH_URL } from "@/lib/env";
import { answerViewSchema } from "@/lib/schemas";
import { nodeToStage, type StageId } from "@/lib/stages";
import { buildStepsFromLedger, reduceSteps, type GovEvent, type TimelineStep } from "@/lib/steps";
import type { AnswerView } from "@/lib/types";

/**
 * The slice of graph state we care about. `messages` is loosely typed so the
 * `submit` payload below (a bare human turn) type-checks; the rendered messages
 * come from `stream.messages`, which the SDK types on its own.
 */
interface ChatStreamState {
  messages: Array<{
    id?: string;
    type?: string;
    content?: unknown;
    additional_kwargs?: Record<string, unknown>;
  }>;
  answer: unknown;
}

/** Content can arrive as a string or an array of content parts — flatten to text. */
function flattenContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text: unknown }).text ?? "");
        }
        return "";
      })
      .join("");
  }
  return "";
}

function parseAnswer(raw: unknown): AnswerView | null {
  const parsed = answerViewSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function useStreamChat(): ChatTransport {
  const [activeStage, setActiveStage] = useState<StageId | null>(null);
  // Agent-path live timeline, folded from the custom `GovEvent` stream.
  const [steps, setSteps] = useState<TimelineStep[]>([]);
  const [servePath, setServePath] = useState<"flow" | "agent" | null>(null);
  // Completed traces, kept by assistant-message id so each finished turn keeps
  // its timeline after the run ends (the live `steps` state resets next send).
  // State, not a ref, so the mapping below can read it during render.
  const [completedSteps, setCompletedSteps] = useState<Map<string, TimelineStep[]>>(new Map());
  // Latest live trace, mirrored in a ref so the `onFinish` event handler can read
  // it (event handlers may touch refs; render may not) to snapshot the finished
  // turn's timeline — no ref reads during render, no setState inside an effect.
  const stepsRef = useRef<TimelineStep[]>([]);

  // Graceful degradation: if the streaming run errors (e.g. the LangGraph server
  // can't execute the graph), fall back to the non-streaming POST /chat transport
  // and replay the pending question there, so chat still works. `degradedRef`
  // guards against re-entrancy since onError can fire more than once.
  const rest = useRestChat();
  const [degraded, setDegraded] = useState(false);
  const degradedRef = useRef(false);
  const pendingRef = useRef("");

  const stream = useStream<ChatStreamState>({
    apiUrl: LANGGRAPH_URL,
    assistantId: ASSISTANT_ID,
    messagesKey: "messages",
    onCustomEvent: (data) => {
      // Two event shapes ride the same custom channel:
      //  • the governance `GovEvent` (agent path) — has `kind` + numeric `seq`;
      //  • the legacy `{ stage }` event (flow path) — drives the fixed stepper.
      const ev = data as (Partial<GovEvent> & { stage?: unknown }) | null | undefined;
      if (ev?.serve_path) setServePath(ev.serve_path);
      if (typeof ev?.kind === "string" && typeof ev.seq === "number") {
        const next = reduceSteps(stepsRef.current, ev as GovEvent);
        stepsRef.current = next;
        setSteps(next);
        // Keep the fixed stepper coherent too, for rails that map to a stage.
        if (ev.kind === "rail" && typeof ev.step === "string") {
          const mapped = nodeToStage(ev.step);
          if (mapped) setActiveStage(mapped);
        }
      } else if (typeof ev?.stage === "string") {
        setActiveStage(nodeToStage(ev.stage));
      }
    },
    onFinish: (state) => {
      // Run finished: snapshot the live trace under the completed assistant
      // message's id so its timeline persists after the answer lands.
      const captured = stepsRef.current;
      if (captured.length === 0) return;
      const msgs = (state?.values as ChatStreamState | undefined)?.messages ?? [];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i]?.type !== "human") {
          const id = msgs[i]?.id ?? `stream-${i}`;
          setCompletedSteps((prev) => new Map(prev).set(id, captured));
          break;
        }
      }
    },
    onError: () => {
      if (degradedRef.current) return;
      degradedRef.current = true;
      setDegraded(true);
      toast.error("Live streaming unavailable — answered without live progress.");
      if (pendingRef.current) rest.send(pendingRef.current);
    },
  });

  const isRunning = stream.isLoading;

  // Channel answer (handoff §3) — used for the latest assistant turn when present.
  const channelAnswer = parseAnswer(stream.values?.answer);

  let lastAssistantIndex = -1;
  for (let i = stream.messages.length - 1; i >= 0; i--) {
    if (stream.messages[i]?.type !== "human") {
      lastAssistantIndex = i;
      break;
    }
  }

  // The persistent trace for a finished assistant turn: the captured live trace
  // if we have it, else rebuilt from the answer's ledger (live == audit).
  const stepsFor = (id: string, answer: AnswerView): TimelineStep[] | undefined => {
    const captured = completedSteps.get(id);
    if (captured && captured.length > 0) return captured;
    const fromLedger = buildStepsFromLedger(answer.provenance?.governance_ledger);
    return fromLedger.length > 0 ? fromLedger : undefined;
  };

  const messages: ChatMessage[] = stream.messages
    .map((message, index): ChatMessage | null => {
      const id = message.id ?? `stream-${index}`;

      if (message.type === "human") {
        return { id, role: "user", text: flattenContent(message.content) };
      }

      // Prefer the graph-state answer channel on the latest assistant message
      // once the run finishes; fall back to per-message stamps / streamed text.
      if (index === lastAssistantIndex && channelAnswer && !isRunning) {
        return { id, role: "assistant", answer: channelAnswer, steps: stepsFor(id, channelAnswer) };
      }

      const governed = message.additional_kwargs?.governed_bi;
      if (governed != null) {
        const parsed = parseAnswer(governed);
        if (parsed) return { id, role: "assistant", answer: parsed, steps: stepsFor(id, parsed) };
      }

      const text = flattenContent(message.content);
      // Skip empty assistant frames (e.g. a fresh AI message before any token)
      // so the running StageStepper isn't shadowed by a blank bubble.
      if (text.trim() === "") return null;
      return { id, role: "assistant", text };
    })
    .filter((message): message is ChatMessage => message !== null);

  // If the channel answer landed with no assistant message frame yet, append one.
  if (
    !isRunning &&
    channelAnswer &&
    !messages.some((m) => m.role === "assistant" && m.answer != null)
  ) {
    messages.push({
      id: "channel-answer",
      role: "assistant",
      answer: channelAnswer,
      steps: stepsFor("channel-answer", channelAnswer),
    });
  }

  const send = (question: string) => {
    if (degradedRef.current) {
      rest.send(question);
      return;
    }
    const trimmed = question.trim();
    if (!trimmed || isRunning) return;
    pendingRef.current = trimmed;
    // Don't assume a path yet: leave activeStage null until the first event
    // reveals flow (a stage event) vs. agent (a GovEvent). Seeding "Routing"
    // here flashed the fixed stepper before the agent timeline took over.
    setActiveStage(null);
    // Reset the agent timeline for the new turn; the first event re-picks the path.
    stepsRef.current = [];
    setSteps([]);
    setServePath(null);
    void stream.submit(
      { messages: [{ type: "human", content: trimmed }] },
      { streamMode: ["values", "messages", "custom"] },
    );
  };

  // Once degraded, the REST transport owns the whole transcript + sends.
  if (degraded) return rest;

  return {
    messages,
    send,
    isRunning,
    // Progress state only means anything mid-run; clear it when idle. (The
    // completed trace re-renders from `governance_ledger` in the provenance
    // drawer, so nothing is lost.)
    activeStage: isRunning ? activeStage : null,
    steps: isRunning ? steps : [],
    servePath: isRunning ? servePath : null,
    stop: () => stream.stop(),
  };
}
