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

import { MOCK_ANSWER, MOCK_REFUSAL } from "@/lib/mock/fixtures";
import { STAGE_IDS, type StageId } from "@/lib/stages";
import type { AnswerView } from "@/lib/types";

export type ChatRole = "user" | "assistant";

/** One turn in the transcript. Assistants carry a full AnswerView; users, text. */
export interface ChatMessage {
  id: string;
  role: ChatRole;
  text?: string;
  answer?: AnswerView;
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
}

export interface UseChatResult extends ChatTransport {
  reset: () => void;
}

/**
 * Questions matching this route to a refusal in the mock transport, standing in
 * for the engine's negative-example / excluded-field fail-closed behavior.
 */
const REFUSAL_PATTERN = /restrict|exclud|pii|card|secret|password/i;

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

      // 2) Enter the running state at the first stage.
      setIsRunning(true);
      setActiveStage(STAGE_IDS[0] ?? null);

      // 3) Advance through the remaining stages, then emit the assistant answer.
      clearTimer();
      let stageIndex = 0;
      timerRef.current = window.setInterval(() => {
        stageIndex += 1;

        if (stageIndex < STAGE_IDS.length) {
          setActiveStage(STAGE_IDS[stageIndex]);
          return;
        }

        // Final stage completed → resolve and stop the pipeline.
        clearTimer();
        const answer: AnswerView = REFUSAL_PATTERN.test(trimmed) ? MOCK_REFUSAL : MOCK_ANSWER;
        setMessages((prev) => [...prev, { id: nextId(), role: "assistant", answer }]);
        setIsRunning(false);
        setActiveStage(null);
      }, STAGE_INTERVAL_MS);
    },
    [clearTimer, isRunning],
  );

  const reset = useCallback(() => {
    clearTimer();
    setMessages([]);
    setIsRunning(false);
    setActiveStage(null);
  }, [clearTimer]);

  return { messages, send, isRunning, activeStage, reset };
}
