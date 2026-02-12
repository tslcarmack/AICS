// ========================================
// Ticket
// ========================================
export enum TicketStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  AWAITING_REPLY = 'awaiting_reply',
  RESOLVED = 'resolved',
  ESCALATED = 'escalated',
  CLOSED = 'closed',
}

export enum TicketSource {
  EMAIL = 'email',
  API = 'api',
  MANUAL = 'manual',
}

export enum MessageDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}

// ========================================
// Intent
// ========================================
export enum IntentType {
  PRESET = 'preset',
  CUSTOM = 'custom',
}

// ========================================
// Variable
// ========================================
export enum VariableType {
  VALUE = 'value',
  LIST = 'list',
}

export enum VariableExtractionMethod {
  AUTO_SYNC = 'auto_sync',
  KEYWORD = 'keyword',
  SMART = 'smart',
  NOT_EXTRACTED = 'not_extracted',
}

// ========================================
// Agent
// ========================================
export enum AgentType {
  CONVERSATIONAL = 'conversational',
  WORKFLOW = 'workflow',
}

export enum WorkflowStepType {
  LLM_CALL = 'llm_call',
  CONDITION = 'condition',
  VARIABLE_SET = 'variable_set',
  HTTP_REQUEST = 'http_request',
  SUB_AGENT = 'sub_agent',
}

// ========================================
// Safety
// ========================================
export enum SafetyRuleType {
  BUILTIN = 'builtin',
  CUSTOM = 'custom',
}

export enum SafetyCheckType {
  KEYWORD = 'keyword',
  REGEX = 'regex',
  LLM = 'llm',
}

export enum SafetySeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum SafetyAction {
  FLAG = 'flag',
  BLOCK = 'block',
  ESCALATE = 'escalate',
}

export enum SafetyCheckResult {
  PASSED = 'passed',
  FAILED = 'failed',
}

// ========================================
// Pipeline
// ========================================
export enum PipelineStage {
  INGEST = 'ingest',
  INTENT = 'intent',
  VARIABLE = 'variable',
  AGENT = 'agent',
  SAFETY = 'safety',
  REPLY = 'reply',
}

export enum PipelineStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ESCALATED = 'escalated',
}

// ========================================
// User
// ========================================
export enum UserRole {
  ADMIN = 'admin',
  AGENT = 'agent',
}
