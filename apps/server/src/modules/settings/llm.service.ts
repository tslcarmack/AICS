import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type {
  LlmChatMessage,
  LlmChatOptions,
  LlmChatResponse,
  LlmEmbeddingResponse,
} from '@aics/shared';
import { SettingsService } from './settings.service';

/**
 * DB keys — must match what the frontend Settings page saves (camelCase).
 * Frontend sends: { llmApiKey, llmApiBaseUrl, llmModel, llmEmbeddingModel }
 */
const DB_KEY = {
  API_KEY: 'llmApiKey',
  BASE_URL: 'llmApiBaseUrl',
  MODEL: 'llmModel',
  EMBEDDING_MODEL: 'llmEmbeddingModel',
} as const;

/**
 * Env-var keys — read from .env / process.env as fallback.
 */
const ENV_KEY = {
  API_KEY: 'LLM_API_KEY',
  BASE_URL: 'LLM_BASE_URL',
  MODEL: 'LLM_MODEL',
  EMBEDDING_MODEL: 'LLM_EMBEDDING_MODEL',
} as const;

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private client: OpenAI | null = null;
  private clientConfig: { apiKey: string; baseURL: string } | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
  ) {}

  // ── Config resolution ────────────────────────────────────────────────

  /**
   * Read a single config value.
   * Priority: DB (set via Settings UI) → env var (.env) → defaultValue.
   */
  private async getSetting(
    dbKey: string,
    envKey: string,
    defaultValue = '',
  ): Promise<string> {
    // 1. DB value (saved via the Settings page)
    const dbValue = await this.settingsService.get<string>(dbKey);
    if (dbValue) return dbValue;

    // 2. Env var
    const envValue = this.configService.get<string>(envKey);
    if (envValue) return envValue;

    // 3. Hard-coded default
    return defaultValue;
  }

  /**
   * Return the full resolved LLM config for debugging / logging.
   */
  async getResolvedConfig() {
    const apiKey = await this.getSetting(DB_KEY.API_KEY, ENV_KEY.API_KEY);
    const baseURL = await this.getSetting(DB_KEY.BASE_URL, ENV_KEY.BASE_URL, 'https://api.openai.com/v1');
    const model = await this.getSetting(DB_KEY.MODEL, ENV_KEY.MODEL, 'gpt-4');
    const embeddingModel = await this.getSetting(DB_KEY.EMBEDDING_MODEL, ENV_KEY.EMBEDDING_MODEL, '');

    return {
      apiKey: apiKey ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}` : '(not set)',
      baseURL,
      model,
      embeddingModel: embeddingModel || '(not set)',
    };
  }

  // ── Client management ────────────────────────────────────────────────

  private async getClient(): Promise<OpenAI> {
    const apiKey = await this.getSetting(DB_KEY.API_KEY, ENV_KEY.API_KEY);
    const baseURL = await this.getSetting(DB_KEY.BASE_URL, ENV_KEY.BASE_URL, 'https://api.openai.com/v1');

    // Reuse client if config hasn't changed
    if (
      this.client &&
      this.clientConfig &&
      this.clientConfig.apiKey === apiKey &&
      this.clientConfig.baseURL === baseURL
    ) {
      return this.client;
    }

    if (!apiKey) {
      throw new Error('LLM API Key not configured. Please set it in System Settings or .env');
    }

    this.logger.log(`Creating LLM client: baseURL=${baseURL}`);
    this.client = new OpenAI({ apiKey, baseURL });
    this.clientConfig = { apiKey, baseURL };
    return this.client;
  }

  /** Reset cached client (call after settings change). */
  resetClient() {
    this.client = null;
    this.clientConfig = null;
    this.logger.log('LLM client cache cleared');
  }

  // ── Chat ─────────────────────────────────────────────────────────────

  async chat(
    messages: LlmChatMessage[],
    options?: LlmChatOptions,
  ): Promise<LlmChatResponse> {
    const client = await this.getClient();
    const model =
      options?.model ||
      (await this.getSetting(DB_KEY.MODEL, ENV_KEY.MODEL, 'gpt-4'));

    try {
      // Build message array with proper typing for tool calls
      const formattedMessages: any[] = messages.map((m) => {
        const msg: any = {
          role: m.role,
          content: m.content,
        };
        // Tool call response message
        if (m.role === 'tool' && m.tool_call_id) {
          msg.tool_call_id = m.tool_call_id;
        }
        // Assistant message with tool calls
        if (m.role === 'assistant' && m.tool_calls) {
          msg.tool_calls = m.tool_calls;
        }
        return msg;
      });

      const requestParams: any = {
        model,
        messages: formattedMessages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens,
        top_p: options?.topP,
      };

      // Add tools if provided
      if (options?.tools && options.tools.length > 0) {
        requestParams.tools = options.tools;
      }
      if (options?.tool_choice) {
        requestParams.tool_choice = options.tool_choice;
      }

      const response = await client.chat.completions.create(requestParams);
      const message = response.choices[0]?.message;

      // Check for tool calls in the response
      const toolCalls = message?.tool_calls?.map((tc: any) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      }));

      return {
        content: message?.content || '',
        tool_calls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      this.logger.error(`LLM chat error (model=${model}):`, (error as Error).message);
      throw error;
    }
  }

  // ── Embedding ────────────────────────────────────────────────────────

  async embed(text: string): Promise<LlmEmbeddingResponse> {
    const client = await this.getClient();
    const model = await this.getSetting(
      DB_KEY.EMBEDDING_MODEL,
      ENV_KEY.EMBEDDING_MODEL,
      'text-embedding-ada-002',
    );

    try {
      const response = await client.embeddings.create({ model, input: text });
      return {
        embedding: response.data[0].embedding,
        usage: response.usage
          ? { totalTokens: response.usage.total_tokens }
          : undefined,
      };
    } catch (error) {
      this.logger.error(`LLM embed error (model=${model}):`, (error as Error).message);
      throw error;
    }
  }

  async embedBatch(texts: string[]): Promise<LlmEmbeddingResponse[]> {
    const client = await this.getClient();
    const model = await this.getSetting(
      DB_KEY.EMBEDDING_MODEL,
      ENV_KEY.EMBEDDING_MODEL,
      'text-embedding-ada-002',
    );

    try {
      const response = await client.embeddings.create({ model, input: texts });
      return response.data.map((d) => ({
        embedding: d.embedding,
        usage: response.usage
          ? { totalTokens: response.usage.total_tokens }
          : undefined,
      }));
    } catch (error) {
      this.logger.error(`LLM embedBatch error (model=${model}):`, (error as Error).message);
      throw error;
    }
  }
}
