"use client";

import { Conversation } from "@/components/chat/conversation";
import { useChat } from "@/hooks/use-chat";

/**
 * Mock transport container. Owns the synthetic `useChat` state machine and keeps
 * the "Preview mode" banner pinned above the composer so it can't disappear while
 * answers are still synthetic.
 */
export function MockChat() {
  const { messages, send, isRunning, activeStage, steps, servePath, stop } = useChat();

  return (
    <Conversation
      messages={messages}
      send={send}
      isRunning={isRunning}
      activeStage={activeStage}
      steps={steps}
      servePath={servePath}
      stop={stop}
      banner={
        <p className="mb-2 text-xs text-muted-foreground">
          Preview mode — showing synthetic output; attach a backend for live answers.
        </p>
      }
    />
  );
}
