export type Role = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  role: Role
  content: string
  createdAt: number
  /** Set when an assistant response failed to generate */
  error?: string
  /** True while the assistant message is still streaming */
  streaming?: boolean
}

export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

/** Shape of a message sent to the streaming /api/chat endpoint */
export interface ApiChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequestBody {
  messages: ApiChatMessage[]
  /** Optional id of the conversation, for logging/analytics only */
  conversationId?: string
}

/** A single suggestion shown on the welcome screen */
export interface Suggestion {
  id: string
  icon: string
  title: string
  subtitle: string
  prompt: string
  category: 'business' | 'tax' | 'identity' | 'legal' | 'ops'
}
