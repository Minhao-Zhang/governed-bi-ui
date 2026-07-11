"use client";

/**
 * useRestChat — the non-streaming fallback transport.
 *
 * Used when a backend is attached but `/capabilities` reports `can_stream:
 * false` (no LangGraph Server streaming). Each turn is a one-shot `POST /chat`
 * (see `api.chat`), so there are no real stage events; we cycle `activeStage`
 * through STAGE_IDS on a ~250 ms timer purely as an indeterminate progress hint
 * while the request is in flight.
 *
 * Errors surface as a toast and stop the run (the transcript keeps the user's
 * turn but gains no assistant answer).
 */

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import type { ChatMessage, ChatTransport } from "@/hooks/use-chat";
import { ApiError, api } from "@/lib/api-client";
import { STAGE_IDS, type StageId } from "@/lib/stages";
import type { ChatTurn } from "@/lib/types";

/** Milliseconds each indeterminate stage is shown before advancing. */
const STAGE_INTERVAL_MS = 250;

// Module-level fallback counter so ids stay unique without an external dep.
let idCounter = 0;

function nextId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  idCounter += 1;
  return `rest-${idCounter}`;
}

export function useRestChat(): ChatTransport {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [activeStage, setActiveStage] = useState<StageId | null>(null);

  // One stable session id for the whole conversation (created once, client-side).
  const sessionIdRef = useRef<string | null>(null);
  if (sessionIdRef.current === null) sessionIdRef.current = nextId();

  // Holds the running indeterminate-progress interval for teardown.
  const timerRef = useRef<number | null>(null);
  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const send = useCallback(
    (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || isRunning) return;

      // Build the prior-turn history from the transcript BEFORE this turn.
      const history: ChatTurn[] = messages
        .map((message) => ({
          role: message.role,
          text: message.text ?? message.answer?.text ?? "",
        }))
        .filter((turn) => turn.text !== "");

      // 1) Push the user's turn and enter the running state.
      setMessages((prev) => [...prev, { id: nextId(), role: "user", text: trimmed }]);
      setIsRunning(true);

      // 2) Indeterminate progress: cycle stages on a timer (POST has no events).
      setActiveStage(STAGE_IDS[0] ?? null);
      clearTimer();
      let index = 0;
      timerRef.current = window.setInterval(() => {
        index = (index + 1) % STAGE_IDS.length;
        setActiveStage(STAGE_IDS[index]);
      }, STAGE_INTERVAL_MS);

      // 3) Fire the request; append the assistant answer or toast on failure.
      const sessionId = sessionIdRef.current ?? nextId();
      api
        .chat(trimmed, history, sessionId)
        .then((answer) => {
          setMessages((prev) => [...prev, { id: nextId(), role: "assistant", answer }]);
        })
        .catch((error: unknown) => {
          const message =
            error instanceof ApiError
              ? error.message
              : "The backend could not answer that question.";
          toast.error(message);
        })
        .finally(() => {
          clearTimer();
          setIsRunning(false);
          setActiveStage(null);
        });
    },
    [clearTimer, isRunning, messages],
  );

  return { messages, send, isRunning, activeStage };
}
