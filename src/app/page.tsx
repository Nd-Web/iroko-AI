'use client'

import * as React from 'react'
import { Menu, Plus, ArrowDown, Phone } from 'lucide-react'
import { useChatStore } from '@/lib/chat-store'
import { useIrokoChat } from '@/hooks/use-iroko-chat'
import { ChatSidebarContent } from '@/components/chat/chat-sidebar'
import { ChatWelcome } from '@/components/chat/chat-welcome'
import { ChatMessageItem } from '@/components/chat/chat-message'
import { ChatComposer } from '@/components/chat/chat-composer'
import { ThemeToggle } from '@/components/chat/theme-toggle'
import { VoiceCallMode } from '@/components/chat/voice-call-mode'
import { toast } from '@/hooks/use-toast'
import { IrokoLogo } from '@/components/iroko-logo'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet'
import type { ChatMessage } from '@/lib/types'

export default function Home() {
  const hydrateFromServer = useChatStore((s) => s.hydrateFromServer)

  // Load this account's conversations from the server on mount.
  React.useEffect(() => {
    hydrateFromServer()
  }, [hydrateFromServer])

  // Returning from Paystack checkout (?payment=success|failed) — show the
  // outcome, then clean the URL.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const payment = params.get('payment')
    if (!payment) return
    if (payment === 'success') {
      toast({
        title: 'Payment received ✅',
        description: 'Iroko is processing your request now. Ask in the chat for updates anytime.',
      })
    } else if (payment === 'failed') {
      toast({
        title: 'Payment not completed',
        description: 'The payment didn’t go through. Ask Iroko to resend the payment link.',
        variant: 'destructive',
      })
    }
    params.delete('payment')
    const clean = `${window.location.pathname}${params.size ? `?${params}` : ''}`
    window.history.replaceState(null, '', clean)
  }, [])

  const activeId = useChatStore((s) => s.activeId)
  const conversations = useChatStore((s) => s.conversations)
  const startNewChat = useChatStore((s) => s.startNewChat)

  const {
    isStreaming,
    streamingContent,
    streamingMessageId,
    streamingConversationId,
    sendMessage,
    regenerate,
    stop,
  } = useIrokoChat()

  const active = React.useMemo(
    () => conversations.find((c) => c.id === activeId),
    [conversations, activeId],
  )

  const messages = active?.messages ?? []
  const hasMessages = messages.length > 0

  // Build the display list, appending the in-flight streaming assistant message
  const displayMessages = React.useMemo<ChatMessage[]>(() => {
    if (
      isStreaming &&
      streamingConversationId === activeId &&
      streamingMessageId
    ) {
      return [
        ...messages,
        {
          id: streamingMessageId,
          role: 'assistant',
          content: streamingContent,
          createdAt: Date.now(),
          streaming: true,
        },
      ]
    }
    return messages
  }, [
    messages,
    isStreaming,
    streamingConversationId,
    activeId,
    streamingMessageId,
    streamingContent,
  ])

  // Index of the last assistant message (for the regenerate button)
  const lastAssistantIdx = React.useMemo(() => {
    for (let i = displayMessages.length - 1; i >= 0; i--) {
      if (displayMessages[i].role === 'assistant') return i
    }
    return -1
  }, [displayMessages])

  // Auto-scroll behaviour
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [stick, setStick] = React.useState(true)
  const [showJump, setShowJump] = React.useState(false)

  const onScroll = React.useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight
    const atBottom = dist < 90
    setStick(atBottom)
    setShowJump(!atBottom)
  }, [])

  React.useEffect(() => {
    if (!stick) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [displayMessages, streamingContent, stick])

  // Reset scroll position when switching conversations
  React.useEffect(() => {
    setStick(true)
    setShowJump(false)
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [activeId])

  const scrollToBottom = React.useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    setStick(true)
    setShowJump(false)
  }, [])

  const handleSend = React.useCallback(
    (text: string) => {
      setStick(true)
      sendMessage(text)
    },
    [sendMessage],
  )

  const handleNewChat = React.useCallback(() => {
    startNewChat()
  }, [startNewChat])

  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [voiceCallOpen, setVoiceCallOpen] = React.useState(false)

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-72 shrink-0 border-r border-sidebar-border md:block">
        <ChatSidebarContent onStartFlow={handleSend} />
      </aside>

      {/* Mobile sidebar (Sheet) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[85vw] max-w-xs p-0">
          <SheetTitle className="sr-only">Conversations</SheetTitle>
          <ChatSidebarContent
            onNavigate={() => setMobileOpen(false)}
            onStartFlow={handleSend}
          />
        </SheetContent>
      </Sheet>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar — desktop */}
        <header className="hidden h-14 shrink-0 items-center justify-between border-b border-border/50 bg-background/80 px-4 backdrop-blur md:flex">
          <div className="flex items-center gap-2">
            <button onClick={handleNewChat} className="text-sm font-medium text-muted-foreground hover:text-foreground">
              {active?.title ?? 'New conversation'}
            </button>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="default"
              size="sm"
              onClick={() => setVoiceCallOpen(true)}
              className="mr-1 gap-1.5 rounded-full"
            >
              <Phone className="h-3.5 w-3.5" />
              Voice call
            </Button>
            <ThemeToggle />
          </div>
        </header>

        {/* Top bar — mobile: just menu, brand, voice, new chat. Calm. */}
        <header className="iroko-safe-top flex shrink-0 items-center justify-between border-b border-border/50 bg-background/80 px-2 backdrop-blur md:hidden">
          <div className="flex h-14 items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10"
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <button
              onClick={handleNewChat}
              className="ml-0.5 flex h-10 items-center"
              aria-label="New chat"
            >
              <IrokoLogo size={26} withWordmark />
            </button>
          </div>
          <div className="flex h-14 items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10"
              onClick={() => setVoiceCallOpen(true)}
              aria-label="Voice call"
            >
              <Phone className="h-[1.15rem] w-[1.15rem]" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10"
              onClick={handleNewChat}
              aria-label="New chat"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        </header>

        {/* Messages area */}
        <main className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="iroko-scroll min-h-0 flex-1 overflow-y-auto"
          >
            {hasMessages ? (
              <div className="mx-auto w-full max-w-3xl py-4 sm:py-6">
                {displayMessages.map((m, i) => (
                  <ChatMessageItem
                    key={m.id}
                    message={m}
                    isLastAssistant={i === lastAssistantIdx}
                    streaming={m.streaming}
                    onRegenerate={regenerate}
                    onQuickReply={handleSend}
                  />
                ))}
                <div className="h-4" />
              </div>
            ) : (
              <div className="min-h-full">
                <ChatWelcome onPick={handleSend} />
              </div>
            )}
          </div>

          {/* Scroll to bottom */}
          {showJump && hasMessages && (
            <button
              type="button"
              onClick={scrollToBottom}
              aria-label="Scroll to latest"
              className="absolute bottom-24 left-1/2 z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-border/70 bg-card/95 text-foreground shadow-md backdrop-blur transition-transform hover:scale-105 sm:bottom-28"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
          )}

          {/* Composer — floating, safe-area aware */}
          <div className="iroko-safe-bottom shrink-0 bg-background pt-1 sm:pb-3">
            <ChatComposer
              onSend={handleSend}
              onStop={stop}
              isStreaming={isStreaming}
            />
          </div>
        </main>
      </div>

      <VoiceCallMode
        open={voiceCallOpen}
        onOpenChange={setVoiceCallOpen}
        chat={{ isStreaming, streamingContent, streamingMessageId, streamingConversationId, sendMessage, stop }}
      />
    </div>
  )
}
