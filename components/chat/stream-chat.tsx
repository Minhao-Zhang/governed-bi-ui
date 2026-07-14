"use client";

import { Conversation } from "@/components/chat/conversation";
import { useStreamChat } from "@/hooks/use-stream-chat";

/**
 * Live streaming transport container. Owns the `useStream`-backed hook; mounted
 * only when the backend reports `can_stream: true`.
 */
export function StreamChat() {
  const { messages, send, isRunning, activeStage, steps, servePath } = useStreamChat();

  return (
    <Conversation
      messages={messages}
      send={send}
      isRunning={isRunning}
      activeStage={activeStage}
      steps={steps}
      servePath={servePath}
    />
  );
}
