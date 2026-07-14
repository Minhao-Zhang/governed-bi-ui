"use client";

import { useEffect, useRef } from "react";

import { AnswerCard } from "@/components/answer/answer-card";
import { ServeProgress } from "@/components/chat/serve-progress";
import type { ChatMessage } from "@/hooks/use-chat";
import type { StageId } from "@/lib/stages";
import type { TimelineStep } from "@/lib/steps";

/**
 * The transcript. User turns are right-aligned bubbles; assistant turns render
 * a full <AnswerCard/>. While the pipeline is running (before its answer lands),
 * a placeholder assistant bubble shows the running progress — the classic fixed
 * stepper on the flow path, or the live agent timeline on the agent path.
 * Auto-scrolls to the newest turn as messages arrive or progress advances.
 */
export function MessageList({
  messages,
  isRunning,
  activeStage,
  steps,
  servePath,
}: {
  messages: ChatMessage[];
  isRunning: boolean;
  activeStage: StageId | null;
  steps?: TimelineStep[];
  servePath?: "flow" | "agent" | null;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Keep the latest turn in view on new messages, stage transitions, or new
  // timeline rows (the agent loop grows without a stage change).
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, isRunning, activeStage, steps?.length]);

  return (
    <div className="space-y-4 py-2">
      {messages.map((message) =>
        message.role === "user" ? (
          <UserBubble key={message.id} text={message.text ?? ""} />
        ) : (
          <div key={message.id} className="w-full">
            {message.answer ? (
              <AnswerCard answer={message.answer} steps={message.steps} />
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
          <ServeProgress
            isRunning={isRunning}
            activeStage={activeStage}
            steps={steps}
            servePath={servePath}
          />
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
