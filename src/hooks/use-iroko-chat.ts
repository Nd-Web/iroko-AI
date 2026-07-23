'use client'

import { useCallback, useRef, useState } from 'react'
import { useChatStore, uid } from '@/lib/chat-store'
import type { ChatMessage, ApiChatMessage } from '@/lib/types'

export interface SendMessageOptions {
  /** 'voice' makes the AI reply in short, speakable sentences. */
  mode?: 'text' | 'voice'
}

interface UseIrokoChatResult {
  /** true while a response is actively streaming */
  isStreaming: boolean
  /** partial content of the in-flight assistant message */
  streamingContent: string
  /** id of the in-flight assistant message (not yet committed to the store) */
  streamingMessageId: string | null
  /** conversation the active stream belongs to */
  streamingConversationId: string | null
  /** send a user message and stream the reply */
  sendMessage: (text: string, opts?: SendMessageOptions) => Promise<void>
  /** regenerate the last assistant reply */
  regenerate: () => Promise<void>
  /** abort the in-flight stream */
  stop: () => void
}

export function useIrokoChat(): UseIrokoChatResult {
  const activeId = useChatStore((s) => s.activeId)
  const addMessage = useChatStore((s) => s.addMessage)
  const removeMessagesFrom = useChatStore((s) => s.removeMessagesFrom)
  const createConversation = useChatStore((s) => s.createConversation)

  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null)
  const [streamingConversationId, setStreamingConversationId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const ensureConversation = useCallback(() => {
    const state = useChatStore.getState()
    if (state.activeId) return state.activeId
    return createConversation()
  }, [createConversation])

  const toApiMessages = (convId: string): ApiChatMessage[] => {
    const conv = useChatStore
      .getState()
      .conversations.find((c) => c.id === convId)
    if (!conv) return []
    return conv.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))
  }

  const runStream = useCallback(
    async (convId: string, apiMessages: ApiChatMessage[], mode: 'text' | 'voice' = 'text') => {
      const assistantId = uid()
      setStreamingMessageId(assistantId)
      setStreamingConversationId(convId)
      setStreamingContent('')
      setIsStreaming(true)

      const controller = new AbortController()
      abortRef.current = controller

      let acc = ''

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ messages: apiMessages, conversationId: convId, mode }),
          signal: controller.signal,
        })

        if (!res.ok || !res.body) {
          let msg = `Request failed (${res.status})`
          try {
            const j = await res.json()
            if (j?.error) msg = j.error
          } catch {
            /* ignore */
          }
          addMessage(convId, {
            id: assistantId,
            role: 'assistant',
            content: '',
            createdAt: Date.now(),
            error: msg,
          })
          setIsStreaming(false)
          setStreamingMessageId(null)
          setStreamingConversationId(null)
          setStreamingContent('')
          abortRef.current = null
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let finished = false

        while (!finished) {
          const { done, value } = await reader.read()
          if (done) {
            finished = true
          }
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          // keep the trailing (possibly partial) line in the buffer
          buffer = lines.pop() ?? ''
          for (const rawLine of lines) {
            const line = rawLine.trim()
            if (!line || line.startsWith(':')) continue
            if (!line.startsWith('data:')) continue
            const data = line.slice(5).trim()
            if (data === '[DONE]') {
              finished = true
              break
            }
            try {
              const json = JSON.parse(data)
              const delta = json?.choices?.[0]?.delta?.content
              if (typeof delta === 'string' && delta) {
                acc += delta
                setStreamingContent(acc)
              }
            } catch {
              /* ignore malformed/partial JSON */
            }
          }
        }
      } catch (err: unknown) {
        const isAbort =
          err instanceof DOMException && err.name === 'AbortError'
        if (!isAbort) {
          addMessage(convId, {
            id: assistantId,
            role: 'assistant',
            content: acc,
            createdAt: Date.now(),
            error: 'Connection interrupted. Please try again.',
          })
          setIsStreaming(false)
          setStreamingMessageId(null)
          setStreamingConversationId(null)
          setStreamingContent('')
          abortRef.current = null
          return
        }
        // aborted by user — keep whatever partial content we have
      } finally {
        abortRef.current = null
      }

      // commit the final (or partial, if stopped) assistant message
      addMessage(convId, {
        id: assistantId,
        role: 'assistant',
        content: acc.length ? acc : '(no response)',
        createdAt: Date.now(),
      })
      setIsStreaming(false)
      setStreamingMessageId(null)
      setStreamingConversationId(null)
      setStreamingContent('')
    },
    [addMessage],
  )

  const sendMessage = useCallback(
    async (text: string, opts?: SendMessageOptions) => {
      const content = text.trim()
      if (!content || isStreaming) return
      const convId = ensureConversation()
      const userMsg: ChatMessage = {
        id: uid(),
        role: 'user',
        content,
        createdAt: Date.now(),
      }
      addMessage(convId, userMsg)
      await runStream(convId, toApiMessages(convId), opts?.mode ?? 'text')
    },
    [isStreaming, ensureConversation, addMessage, runStream],
  )

  const regenerate = useCallback(async () => {
    if (isStreaming) return
    const state = useChatStore.getState()
    const convId = state.activeId
    if (!convId) return
    const conv = state.conversations.find((c) => c.id === convId)
    if (!conv || conv.messages.length === 0) return

    // find & drop the last assistant message (and anything after it)
    let lastAssistantIdx = -1
    for (let i = conv.messages.length - 1; i >= 0; i--) {
      if (conv.messages[i].role === 'assistant') {
        lastAssistantIdx = i
        break
      }
    }
    if (lastAssistantIdx === -1) return
    removeMessagesFrom(convId, conv.messages[lastAssistantIdx].id)
    await runStream(convId, toApiMessages(convId))
  }, [isStreaming, removeMessagesFrom, runStream])

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return {
    isStreaming,
    streamingContent,
    streamingMessageId,
    streamingConversationId,
    sendMessage,
    regenerate,
    stop,
  }
}
