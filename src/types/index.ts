// Core types for Oblique

export type TaskId = string;
export type UserId = string;

export interface Task {
  id: TaskId;
  type: 'process_message' | 'send_llm_request' | 'send_bluesky_post';
  payload: unknown;
  createdAt: Date;
}

export interface PendingTask {
  id: TaskId;
  taskType: Task['type'];
  createdAt: Date;
  timeoutAt?: Date;
}

export interface UserAction {
  actionId: string;
  userId: UserId;
  action: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface LLMRequest {
  prompt: string;
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
    uri: string;
    cid: string;
  };
}

export interface BlueskyMessage {
  uri: string;
  cid: string;
  author: string;
  text: string;
  createdAt: Date;
}

export interface StorageData {
  queue: Task[];
  pendingMap: Map<TaskId, PendingTask>;
  userStacks: Map<UserId, UserAction[]>;
}

