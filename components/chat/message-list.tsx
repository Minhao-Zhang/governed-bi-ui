"use client";

import { useEffect, useRef } from "react";

import { AnswerCard } from "@/components/answer/answer-card";
import { StageStepper } from "@/components/chat/stage-stepper";
import type { ChatMessage } from "@/hooks/use-chat";
import type { StageId } from "@/lib/stages";

/**
 * The transcript. User turns are right-aligned bubbles; assistant turns render
 * a full <AnswerCard/>. While the pipeline is running (before its answer lands),
 * a placeholder assistant bubble shows the StageStepper. Auto-scrolls to the
 * newest turn as messages arrive or the pipeline advances.
 */
export function MessageList({
  messages,
  isRunning,
  activeStage,
}: {
  messages: ChatMessage[];
  isRunning: boolean;
  activeStage: StageId | null;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Keep the latest turn in view on new messages or stage transitions.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, isRunning, activeStage]);

  return (
    <div className="space-y-4 py-2">
      {messages.map((message) =>
        message.role === "user" ? (
          <UserBubble key={message.id} text={message.text ?? ""} />
        ) : (
          <div key={message.id} className="w-full">
            {message.answer ? (
              <AnswerCard answer={message.answer} />
            ) : (
              // Defensive: assistant turns carry an AnswerView in practice.
              <p className="text-sm text-muted-foreground">{message.text}</p>
            )}
          </div>
        ),
      )}

      {/* Assistant placeholder: the serve pipeline running before its answer. */}
      {isRunning && (
        <div className="w-full rounded-lg border bg-card p-4">
          <StageStepper activeStage={activeStage} />
        </div>
      )}

      {/* Scroll anchor. */}
      <div ref={bottomRef} />
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] whitespace-pre-wrap rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">
        {text}
      </div>
    </div>
  );
}
