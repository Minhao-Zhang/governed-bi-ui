"use client";

import { MessageSquareText } from "lucide-react";

import { Composer } from "@/components/chat/composer";
import { MessageList } from "@/components/chat/message-list";
import type { ChatTransport } from "@/hooks/use-chat";

/**
 * The chat cockpit's shared view: a full-height column where the transcript
 * scrolls and the composer is pinned to the bottom. Transport-neutral — it takes
 * the same `{ messages, send, isRunning, activeStage }` shape every chat hook
 * exposes, so the mock, streaming, and REST containers all render through this
 * one component. An optional `banner` renders just above the composer (used for
 * the mock-mode preview notice).
 */
export function Conversation({
  messages,
  send,
  isRunning,
  activeStage,
  steps,
  servePath,
  banner,
}: ChatTransport & { banner?: React.ReactNode }) {
  const isEmpty = messages.length === 0 && !isRunning;

  return (
    <div className="flex h-full flex-col">
      {/* Scrollable transcript. */}
      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState />
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl">
            <MessageList
              messages={messages}
              isRunning={isRunning}
              activeStage={activeStage}
              steps={steps}
              servePath={servePath}
            />
          </div>
        )}
      </div>

      {/* Composer pinned to the bottom. */}
      <div className="border-t pt-4">
        <div className="mx-auto w-full max-w-3xl">
          {banner}
          <Composer onSend={send} disabled={isRunning} />
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <MessageSquareText className="size-6 text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">Ask a question about the governed data</p>
    </div>
  );
}
