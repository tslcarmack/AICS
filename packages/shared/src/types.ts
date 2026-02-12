// ========================================
// API Response Types
// ========================================
export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  errors?: Record<string, string[]>;
  statusCode: number;
}

// ========================================
// Pagination
// ========================================
export interface PaginationQuery {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ========================================
// Common Query Params
// ========================================
export interface DateRangeQuery {
  startDate?: string;
  endDate?: string;
}

export interface SearchQuery {
  search?: string;
}

// ========================================
// LLM Types
// ========================================
export interface LlmToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface LlmToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
}

export interface LlmChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: LlmToolCall[];
}

export interface LlmChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  tools?: LlmToolDefinition[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

export interface LlmChatResponse {
  content: string;
  tool_calls?: LlmToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LlmEmbeddingResponse {
  embedding: number[];
  usage?: {
    totalTokens: number;
  };
}

// ========================================
// Tool Types
// ========================================
export type ToolType = 'http_api' | 'builtin';
export type ToolAuthType = 'none' | 'api_key' | 'bearer' | 'basic';

export interface ToolExecutionResult {
  success: boolean;
  statusCode?: number;
  data?: unknown;
  error?: string;
  duration: number; // ms
  mappedVariables?: Record<string, string>; // variableName -> extracted value
}
