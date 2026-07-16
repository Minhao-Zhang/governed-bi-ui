"use client";

/**
 * useChat — the chat cockpit's state machine.
 *
 * ── MOCK TRANSPORT (current) ────────────────────────────────────────────────
 * No LangGraph Server is attached yet (USE_MOCKS is the default), so this hook
 * FAKES the governed serve pipeline: on send() it walks `activeStage` through
 * STAGE_IDS on a ~250 ms timer, then resolves to a synthetic AnswerView from the
 * fixtures — MOCK_REFUSAL when the question trips the restricted-content pattern
 * (mirroring the engine's fail-closed negative-example / excluded-field gates),
 * otherwise MOCK_ANSWER.
 *
 * ── REAL PATH (later) ───────────────────────────────────────────────────────
 * When capabilities.can_stream is true, swap this mock for the LangChain
 * `useStream` hook (`@langchain/langgraph-sdk/react`) pointed at
 * LANGGRAPH_URL + ASSISTANT_ID (@/lib/env). Drive `activeStage` from real node
 * updates via nodeToStage(node) (@/lib/stages) instead of a timer, and build the
 * assistant AnswerView from the streamed graph state. The { messages, send,
 * isRunning, activeStage, reset } shape below is intentionally transport-neutral
 * so the UI layer (MessageList / StageStepper / Composer) never changes.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  MOCK_AGENT_ANSWER,
  MOCK_AGENT_EVENTS,
  MOCK_ANSWER,
  MOCK_GRADED_ANSWER,
  MOCK_REFUSAL,
} from "@/lib/mock/fixtures";
import { STAGE_IDS, type StageId } from "@/lib/stages";
import { reduceSteps, type TimelineStep } from "@/lib/steps";
import type { AnswerView } from "@/lib/types";

export type ChatRole = "user" | "assistant";

/** One turn in the transcript. Assistants carry a full AnswerView; users, text. */
export interface ChatMessage {
  id: string;
  role: ChatRole;
  text?: string;
  answer?: AnswerView;
  /** Agent-path trace captured live, kept on the finished turn so the timeline
   * persists after the answer lands (falls back to `governance_ledger`). */
  steps?: TimelineStep[];
}

/**
 * The transport-neutral shape every chat hook exposes to the shared conversation
 * UI. The mock, streaming, and REST transports all satisfy this so the parent can
 * swap containers without the UI layer ever changing.
 */
export interface ChatTransport {
  messages: ChatMessage[];
  send: (question: string) => void;
  isRunning: boolean;
  activeStage: StageId | null;
  /** Agent-path live timeline (§ agent-step-visualization); optional so the
   * rest transport can omit it and the renderer falls back to the stepper. */
  steps?: TimelineStep[];
  /** Which serve path the current turn took; picks the progress renderer. */
  servePath?: "flow" | "agent" | null;
  /** Cancel the in-flight turn. Optional: transports that can't abort (e.g. the
   * plain POST /chat fallback) omit it and the composer hides the Stop button. */
  stop?: () => void;
}

export interface UseChatResult extends ChatTransport {
  reset: () => void;
}

/**
 * Questions matching this route to a refusal in the mock transport, standing in
 * for the engine's negative-example / excluded-field fail-closed behavior.
 */
const REFUSAL_PATTERN = /restrict|exclud|pii|card|secret|password/i;

/** Questions matching this route to a graded-delivery fixture (§13). */
const GRADED_PATTERN = /graded|unverified|fenced/i;

/**
 * Questions matching this replay the agent path (live tool timeline + repair
 * loop) instead of the fixed stepper — a faithful offline stand-in for the
 * `serve_path: "agent"` runs (§ agent-step-visualization).
 */
const AGENT_PATTERN = /agent|reason|corpus|repair|inspect|step/i;

/** Refusal takes priority; the agent replay only fires for non-refused questions. */
function isAgentQuestion(question: string): boolean {
  return AGENT_PATTERN.test(question) && !REFUSAL_PATTERN.test(question);
}

function mockAnswerFor(question: string): AnswerView {
  if (REFUSAL_PATTERN.test(question)) return MOCK_REFUSAL;
  if (GRADED_PATTERN.test(question)) return MOCK_GRADED_ANSWER;
  if (isAgentQuestion(question)) return MOCK_AGENT_ANSWER;
  return MOCK_ANSWER;
}

/** Milliseconds each pipeline stage is shown before advancing to the next. */
const STAGE_INTERVAL_MS = 250;

// Module-level fallback counter so ids stay unique without an external dep.
let idCounter = 0;

function nextId(): string {
  // Prefer the platform UUID; fall back to a counter in older/SSR environments.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  idCounter += 1;
  return `msg-${idCounter}`;
}

export function useChat(): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [activeStage, setActiveStage] = useState<StageId | null>(null);
  const [steps, setSteps] = useState<TimelineStep[]>([]);
  const [servePath, setServePath] = useState<"flow" | "agent" | null>(null);

  // Holds the running stage interval so we can tear it down on reset / unmount.
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Cancel any in-flight pipeline when the consuming component unmounts.
  useEffect(() => clearTimer, [clearTimer]);

  const send = useCallback(
    (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || isRunning) return;

      // 1) Push the user's turn immediately.
      setMessages((prev) => [...prev, { id: nextId(), role: "user", text: trimmed }]);

      // 2) Enter the running state; reset both progress views.
      setIsRunning(true);
      setSteps([]);
      clearTimer();

      const resolve = (answer: AnswerView, finalSteps?: TimelineStep[]) => {
        clearTimer();
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: "assistant", answer, steps: finalSteps },
        ]);
        setIsRunning(false);
        setActiveStage(null);
      };

      // 3a) Agent path: replay the scripted governance trajectory as a live
      // timeline, folding each event through the same reducer the stream uses.
      if (isAgentQuestion(trimmed)) {
        setServePath("agent");
        setActiveStage(null);
        let acc: TimelineStep[] = [];
        let evIndex = 0;
        timerRef.current = window.setInterval(() => {
          if (evIndex < MOCK_AGENT_EVENTS.length) {
            acc = reduceSteps(acc, MOCK_AGENT_EVENTS[evIndex]);
            setSteps(acc);
            evIndex += 1;
            return;
          }
          // Keep the completed trace on the finished turn so it doesn't vanish.
          resolve(mockAnswerFor(trimmed), acc);
        }, STAGE_INTERVAL_MS);
        return;
      }

      // 3b) Flow path: walk the fixed stepper, then emit the assistant answer.
      setServePath("flow");
      setActiveStage(STAGE_IDS[0] ?? null);
      let stageIndex = 0;
      timerRef.current = window.setInterval(() => {
        stageIndex += 1;

        if (stageIndex < STAGE_IDS.length) {
          setActiveStage(STAGE_IDS[stageIndex]);
          return;
        }

        // Final stage completed → resolve and stop the pipeline.
        resolve(mockAnswerFor(trimmed));
      }, STAGE_INTERVAL_MS);
    },
    [clearTimer, isRunning],
  );

  // Abort the running turn, leaving the user's question in the transcript with no
  // answer. The synthetic pipeline is a timer, so tearing it down is enough.
  const stop = useCallback(() => {
    clearTimer();
    setIsRunning(false);
    setActiveStage(null);
    setSteps([]);
    setServePath(null);
  }, [clearTimer]);

  const reset = useCallback(() => {
    clearTimer();
    setMessages([]);
    setIsRunning(false);
    setActiveStage(null);
    setSteps([]);
    setServePath(null);
  }, [clearTimer]);

  return {
    messages,
    send,
    isRunning,
    activeStage,
    // Mirror `activeStage`: progress state only means anything mid-run.
    steps: isRunning ? steps : [],
    servePath: isRunning ? servePath : null,
    stop,
    reset,
  };
}
