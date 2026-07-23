'use client'

import { create } from 'zustand'
import type { Conversation, ChatMessage } from './types'

/** Small id helper — works in browser and modern Node */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/** Derive a short conversation title from the first user message */
export function deriveTitle(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return 'New chat'
  const words = clean.split(' ').slice(0, 7).join(' ')
  return words.length < clean.length ? `${words}…` : words
}

interface ChatState {
  conversations: Conversation[]
  activeId: string | null
  /** true once the initial load from the server has finished (success or failure) */
  hydrated: boolean

  // selectors
  getActive: () => Conversation | undefined

  // actions
  /** Load this account's conversations from the server. Call once on mount. */
  hydrateFromServer: () => Promise<void>
  createConversation: (initialTitle?: string) => string
  startNewChat: () => void
  deleteConversation: (id: string) => void
  renameConversation: (id: string, title: string) => void
  setActive: (id: string) => void
  addMessage: (conversationId: string, message: ChatMessage) => void
  updateMessage: (
    conversationId: string,
    messageId: string,
    patch: Partial<ChatMessage>,
  ) => void
  removeMessagesFrom: (conversationId: string, messageId: string) => void
  clearAll: () => void
}

export const useChatStore = create<ChatState>()((set, get) => ({
  conversations: [],
  activeId: null,
  hydrated: false,

  getActive: () => {
    const { conversations, activeId } = get()
    return conversations.find((c) => c.id === activeId)
  },

  hydrateFromServer: async () => {
    try {
      const res = await fetch('/api/conversations')
      if (!res.ok) throw new Error(`Failed to load conversations (${res.status})`)
      const data = await res.json()
      const conversations: Conversation[] = (data.conversations || []).map((c: any) => ({
        id: c.id,
        title: c.title,
        createdAt: new Date(c.createdAt).getTime(),
        updatedAt: new Date(c.updatedAt).getTime(),
        messages: (c.messages || []).map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: new Date(m.createdAt).getTime(),
        })),
      }))
      set({ conversations, hydrated: true })
    } catch (err) {
      // Keep the app usable even if the initial load fails — just start empty.
      console.warn('[chat-store] failed to load conversations from server:', err)
      set({ hydrated: true })
    }
  },

  createConversation: (initialTitle = 'New chat') => {
    const id = uid()
    const now = Date.now()
    const conversation: Conversation = {
      id,
      title: initialTitle,
      messages: [],
      createdAt: now,
      updatedAt: now,
    }
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      activeId: id,
    }))
    fetch('/api/conversations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, title: initialTitle }),
    }).catch((err) => console.warn('[chat-store] failed to create conversation on server:', err))
    return id
  },

  startNewChat: () => {
    set((state) => ({
      // drop any empty (unused) conversations, then clear the active chat
      conversations: state.conversations.filter(
        (c) => c.messages.length > 0,
      ),
      activeId: null,
    }))
  },

  deleteConversation: (id) => {
    set((state) => {
      const conversations = state.conversations.filter((c) => c.id !== id)
      const activeId =
        state.activeId === id
          ? conversations[0]?.id ?? null
          : state.activeId
      return { conversations, activeId }
    })
    fetch(`/api/conversations/${id}`, { method: 'DELETE' }).catch((err) =>
      console.warn('[chat-store] failed to delete conversation on server:', err),
    )
  },

  renameConversation: (id, title) => {
    const clean = title.trim() || 'Untitled'
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, title: clean, updatedAt: Date.now() } : c,
      ),
    }))
    fetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: clean }),
    }).catch((err) => console.warn('[chat-store] failed to rename conversation on server:', err))
  },

  setActive: (id) => set({ activeId: id }),

  addMessage: (conversationId, message) => {
    let derivedTitle: string | undefined
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id !== conversationId) return c
        const isFirstUser = message.role === 'user' && c.messages.length === 0
        if (isFirstUser) derivedTitle = deriveTitle(message.content)
        return {
          ...c,
          title: isFirstUser ? derivedTitle! : c.title,
          messages: [...c.messages, message],
          updatedAt: Date.now(),
        }
      }),
    }))
    // Only persist user/assistant turns — streaming deltas never reach the
    // store, so this fires at most once per finished turn per role.
    if (message.role === 'user' || message.role === 'assistant') {
      fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: message.id,
          role: message.role,
          content: message.content,
          title: derivedTitle,
        }),
      }).catch((err) => console.warn('[chat-store] failed to persist message on server:', err))
    }
  },

  updateMessage: (conversationId, messageId, patch) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id !== conversationId
          ? c
          : {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId ? { ...m, ...patch } : m,
              ),
              updatedAt: Date.now(),
            },
      ),
    }))
    // Not currently called anywhere in the app — nothing to sync yet.
  },

  removeMessagesFrom: (conversationId, messageId) => {
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id !== conversationId) return c
        const idx = c.messages.findIndex((m) => m.id === messageId)
        if (idx === -1) return c
        return {
          ...c,
          messages: c.messages.slice(0, idx),
          updatedAt: Date.now(),
        }
      }),
    }))
    fetch(`/api/conversations/${conversationId}/messages/${messageId}`, {
      method: 'DELETE',
    }).catch((err) => console.warn('[chat-store] failed to remove messages on server:', err))
  },

  clearAll: () => set({ conversations: [], activeId: null }),
}))
