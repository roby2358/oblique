// Core types for Oblique

export type TaskId = string;
export type UserId = string;
export type ConversationId = string;

export interface Task {
  id: TaskId;
  conversationId?: ConversationId;
  type: 'process_message' | 'send_llm_request' | 'send_bluesky_post' | 'return_response';
  payload: unknown;
  createdAt: Date;
  onComplete?: (result: unknown) => void;
}

export interface PendingTask {
  id: TaskId;
  conversationId?: ConversationId;
  taskType: Task['type'];
  createdAt: Date;
  timeoutAt?: Date;
}

export interface Conversation {
  id: ConversationId;
  userId: UserId;
  tasks: TaskId[];
  status: 'queued' | 'processing' | 'pending' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

export interface LLMRequest {
  conversation: { role: string; content: string }[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface BlueskyPost {
  text: string;
  replyTo?: {
    root: {
      uri: string;
      cid: string;
    };
    parent: {
      uri: string;
      cid: string;
    };
  };
}

export interface BlueskyMessage {
  uri: string;
  cid: string;
  author: string;
  text: string;
  createdAt: Date;
  reason: string; // 'mention', 'reply', 'quote', 'like', 'repost', etc.
  replyInfo?: {
    root: {
      uri: string;
      cid: string;
    };
    parent: {
      uri: string;
      cid: string;
    };
  };
}

export interface StorageData {
  queue: Task[];
  pendingMap: Map<TaskId, PendingTask>;
}

