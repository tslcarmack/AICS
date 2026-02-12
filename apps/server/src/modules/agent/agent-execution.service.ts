import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmService } from '../settings/llm.service';
import { KnowledgeRetrievalService } from '../knowledge/knowledge-retrieval.service';
import { ToolExecutionService } from '../tool/tool-execution.service';
import type { LlmChatMessage, LlmToolDefinition, LlmToolCall } from '@aics/shared';

export interface ExecutionContext {
  ticketId: string;
  customerMessage: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  variables: Record<string, string | null>;
  metadata?: Record<string, unknown>;
}

export interface ExecutionResult {
  reply: string;
  agentId: string;
  agentName: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

const MAX_TOOL_CALL_ITERATIONS = 10;

@Injectable()
export class AgentExecutionService {
  private readonly logger = new Logger(AgentExecutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
    private readonly knowledgeRetrievalService: KnowledgeRetrievalService,
    private readonly toolExecutionService: ToolExecutionService,
  ) {}

  async execute(
    agentId: string,
    context: ExecutionContext,
  ): Promise<ExecutionResult> {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        knowledgeBases: true,
        workflowSteps: { orderBy: { order: 'asc' } },
        tools: {
          include: { tool: true },
        },
      },
    });

    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (agent.type === 'conversational') {
      return this.executeConversational(agent, context);
    } else {
      return this.executeWorkflow(agent, context);
    }
  }

  // ── Conversational Agent ──────────────────────────────────────────

  private async executeConversational(
    agent: any,
    context: ExecutionContext,
  ): Promise<ExecutionResult> {
    // 1. Retrieve knowledge context
    const knowledgeBaseIds = agent.knowledgeBases.map(
      (kb: any) => kb.knowledgeBaseId,
    );
    let knowledgeContext = '';
    if (knowledgeBaseIds.length > 0) {
      this.logger.log(
        `Agent "${agent.name}": retrieving from ${knowledgeBaseIds.length} knowledge base(s)`,
      );
      const results = await this.knowledgeRetrievalService.retrieve(
        context.customerMessage,
        knowledgeBaseIds,
      );
      if (results.length > 0) {
        knowledgeContext = results.map((r) => r.content).join('\n\n---\n\n');
        this.logger.log(
          `Agent "${agent.name}": found ${results.length} knowledge chunk(s), total ${knowledgeContext.length} chars`,
        );
      } else {
        this.logger.warn(
          `Agent "${agent.name}": no knowledge chunks matched for query "${context.customerMessage.slice(0, 50)}..."`,
        );
      }
    } else {
      this.logger.debug(`Agent "${agent.name}": no knowledge bases linked, skipping retrieval`);
    }

    // 2. Build system prompt with variables substitution
    let systemPrompt = agent.systemPrompt || 'You are a helpful customer service assistant.';
    for (const [key, value] of Object.entries(context.variables)) {
      systemPrompt = systemPrompt.replace(
        new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
        value || 'N/A',
      );
    }

    // 3. Add knowledge context
    if (knowledgeContext) {
      systemPrompt += `\n\n## Knowledge Base Context\n${knowledgeContext}`;
    }

    // 4. Load bound tools (only enabled)
    const enabledTools = (agent.tools || [])
      .filter((at: any) => at.tool.enabled)
      .map((at: any) => at.tool);

    const toolDefinitions = this.convertToolsToLlmFormat(enabledTools);

    // Build a map of tool name -> tool record for quick lookup
    const toolMap = new Map<string, any>();
    for (const tool of enabledTools) {
      toolMap.set(tool.name, tool);
    }

    // 5. Add tool usage instructions to system prompt
    if (enabledTools.length > 0) {
      const toolDescriptions = enabledTools
        .map((t: any) => `- ${t.name}: ${t.description}`)
        .join('\n');
      systemPrompt += `\n\n## Available Tools\nYou have the following tools available. When the user's request requires querying data, performing operations, or looking up information that these tools can provide, you MUST call the appropriate tool instead of making up an answer.\n\n${toolDescriptions}\n\nIMPORTANT: If the user asks about information that a tool can retrieve (e.g., order status, account details), always call the tool first to get accurate data before responding.`;

      this.logger.log(
        `Agent "${agent.name}": ${enabledTools.length} tool(s) loaded: [${enabledTools.map((t: any) => t.name).join(', ')}]`,
      );
    } else {
      this.logger.debug(`Agent "${agent.name}": no tools bound or enabled`);
    }

    // 6. Build messages
    const messages: LlmChatMessage[] = [
      { role: 'system', content: systemPrompt },
    ];
    if (context.conversationHistory) {
      for (const msg of context.conversationHistory) {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }
    messages.push({ role: 'user', content: context.customerMessage });

    // 7. Call LLM with tool definitions (function calling loop)
    let iteration = 0;
    let lastUsage: any = undefined;
    const mutableVariables = { ...context.variables };

    while (iteration < MAX_TOOL_CALL_ITERATIONS) {
      iteration++;

      const useTools = iteration <= MAX_TOOL_CALL_ITERATIONS && toolDefinitions.length > 0;

      this.logger.log(
        `Agent "${agent.name}" iteration ${iteration}: sending ${messages.length} messages, tools=${useTools ? toolDefinitions.length : 0}`,
      );
      if (useTools && iteration === 1) {
        this.logger.debug(
          `Agent "${agent.name}": tool definitions sent to LLM: ${JSON.stringify(toolDefinitions.map((t) => t.function.name))}`,
        );
      }

      const response = await this.llmService.chat(messages, {
        model: agent.modelId || undefined,
        temperature: agent.temperature || 0.7,
        maxTokens: agent.maxTokens || undefined,
        topP: agent.topP || undefined,
        tools: useTools ? toolDefinitions : undefined,
        tool_choice: useTools ? 'auto' : undefined,
      });

      lastUsage = response.usage;

      // If no tool calls, we have a final reply
      if (!response.tool_calls || response.tool_calls.length === 0) {
        if (useTools && iteration === 1) {
          this.logger.warn(
            `Agent "${agent.name}": LLM did NOT invoke any tools on first iteration. Reply preview: "${response.content?.slice(0, 100)}..."`,
          );
        }
        return {
          reply: response.content,
          agentId: agent.id,
          agentName: agent.name,
          usage: lastUsage,
        };
      }

      // Log tool calls
      this.logger.log(
        `Agent "${agent.name}" iteration ${iteration}: LLM requested ${response.tool_calls.length} tool call(s): [${response.tool_calls.map((tc) => tc.function.name).join(', ')}]`,
      );

      // Append assistant message with tool_calls
      messages.push({
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.tool_calls,
      });

      // Execute each tool call
      for (const toolCall of response.tool_calls) {
        this.logger.log(
          `Agent "${agent.name}": executing tool "${toolCall.function.name}" with args: ${toolCall.function.arguments?.slice(0, 200)}`,
        );

        const toolResult = await this.executeToolCall(
          toolCall,
          toolMap,
          mutableVariables,
          context,
          agent.id,
        );

        this.logger.log(
          `Agent "${agent.name}": tool "${toolCall.function.name}" result: ${toolResult.slice(0, 300)}`,
        );

        // Append tool result message
        messages.push({
          role: 'tool',
          content: toolResult,
          tool_call_id: toolCall.id,
        });
      }
    }

    // If we exceeded max iterations, force final call without tools
    this.logger.warn(
      `Agent ${agent.id}: tool call loop exceeded ${MAX_TOOL_CALL_ITERATIONS} iterations, forcing final reply`,
    );
    const finalResponse = await this.llmService.chat(messages, {
      model: agent.modelId || undefined,
      temperature: agent.temperature || 0.7,
    });

    return {
      reply: finalResponse.content,
      agentId: agent.id,
      agentName: agent.name,
      usage: finalResponse.usage,
    };
  }

  // ── Tool Call Execution ──────────────────────────────────────────

  private async executeToolCall(
    toolCall: LlmToolCall,
    toolMap: Map<string, any>,
    mutableVariables: Record<string, string | null>,
    context: ExecutionContext,
    agentId: string,
  ): Promise<string> {
    const toolName = toolCall.function.name;
    const tool = toolMap.get(toolName);

    if (!tool) {
      return JSON.stringify({ error: `Tool "${toolName}" not found` });
    }

    try {
      // Parse LLM-provided arguments
      let llmArgs: Record<string, unknown> = {};
      try {
        llmArgs = JSON.parse(toolCall.function.arguments);
      } catch {
        return JSON.stringify({ error: 'Invalid tool call arguments' });
      }

      // Resolve parameters (LLM args + variable bindings)
      const resolvedParams = this.toolExecutionService.resolveParameters(
        tool.parameters as any,
        llmArgs,
        mutableVariables,
      );

      // Execute the tool
      const result = await this.toolExecutionService.execute(
        tool.id,
        resolvedParams,
        {
          ticketId: context.ticketId,
          agentId,
          variables: mutableVariables,
        },
      );

      // Update mutable variables with response mappings
      if (result.mappedVariables) {
        for (const [varName, varValue] of Object.entries(result.mappedVariables)) {
          mutableVariables[varName] = varValue;
        }
      }

      if (result.success) {
        return JSON.stringify(result.data);
      } else {
        return JSON.stringify({ error: result.error || 'Tool execution failed' });
      }
    } catch (error) {
      this.logger.error(
        `Tool call "${toolName}" failed: ${(error as Error).message}`,
      );
      return JSON.stringify({ error: (error as Error).message });
    }
  }

  // ── Convert Tool records to OpenAI format ─────────────────────────

  private convertToolsToLlmFormat(tools: any[]): LlmToolDefinition[] {
    return tools.map((tool) => {
      // Strip variableBinding from parameters schema for LLM
      const cleanParams = this.stripVariableBindings(tool.parameters);

      return {
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: cleanParams,
        },
      };
    });
  }

  private stripVariableBindings(schema: any): Record<string, unknown> {
    if (!schema || typeof schema !== 'object') return schema;

    const cleaned: any = { ...schema };
    if (cleaned.properties) {
      cleaned.properties = {};
      for (const [key, value] of Object.entries(schema.properties as Record<string, any>)) {
        const { variableBinding, ...rest } = value;
        cleaned.properties[key] = rest;
      }
    }
    return cleaned;
  }

  // ── Workflow Agent ────────────────────────────────────────────────

  private async executeWorkflow(
    agent: any,
    context: ExecutionContext,
  ): Promise<ExecutionResult> {
    const steps = agent.workflowSteps || [];
    let currentReply = '';
    const workflowVars: Record<string, any> = { ...context.variables };

    for (const step of steps) {
      try {
        switch (step.type) {
          case 'llm_call': {
            let prompt = step.config?.prompt || context.customerMessage;
            for (const [key, value] of Object.entries(workflowVars)) {
              prompt = prompt.replace(
                new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
                value || 'N/A',
              );
            }
            const response = await this.llmService.chat(
              [
                { role: 'system', content: step.config?.systemPrompt || 'You are a helpful assistant.' },
                { role: 'user', content: prompt },
              ],
              {
                model: step.config?.model || agent.modelId,
                temperature: step.config?.temperature || 0.7,
              },
            );
            currentReply = response.content;
            workflowVars['_lastOutput'] = currentReply;
            break;
          }

          case 'condition': {
            const variableName = step.config?.variable;
            const operator = step.config?.operator || 'equals';
            const expectedValue = step.config?.value;
            const actualValue = workflowVars[variableName];

            let conditionMet = false;
            switch (operator) {
              case 'equals':
                conditionMet = actualValue === expectedValue;
                break;
              case 'contains':
                conditionMet = actualValue?.includes(expectedValue) || false;
                break;
              case 'not_equals':
                conditionMet = actualValue !== expectedValue;
                break;
            }

            if (!conditionMet) {
              this.logger.debug(`Condition not met at step ${step.order}, skipping`);
            }
            break;
          }

          case 'variable_set': {
            const varName = step.config?.variable;
            const varValue = step.config?.value || currentReply;
            workflowVars[varName] = varValue;
            break;
          }

          case 'sub_agent': {
            const subAgentId = step.config?.agentId;
            if (subAgentId === agent.id) {
              throw new Error('Circular reference: agent cannot call itself');
            }
            const subResult = await this.execute(subAgentId, {
              ...context,
              variables: workflowVars,
            });
            currentReply = subResult.reply;
            workflowVars['_lastOutput'] = currentReply;
            break;
          }

          case 'http_request': {
            // Legacy V1: basic HTTP request support
            const url = step.config?.url;
            const method = step.config?.method || 'GET';
            try {
              const response = await fetch(url, { method });
              const data = await response.text();
              workflowVars['_httpResponse'] = data;
            } catch (err) {
              this.logger.error(`HTTP request failed: ${(err as Error).message}`);
            }
            break;
          }

          case 'tool_call': {
            // New: execute a configured tool from tool management
            const toolId = step.config?.toolId;
            if (!toolId) {
              this.logger.error('tool_call step missing toolId in config');
              break;
            }

            // Build parameter overrides with variable substitution
            const paramOverrides: Record<string, unknown> = {};
            if (step.config?.parameterOverrides) {
              for (const [key, value] of Object.entries(step.config.parameterOverrides as Record<string, string>)) {
                // Substitute {{varName}} in override values
                let resolved = value;
                if (typeof resolved === 'string') {
                  for (const [varKey, varVal] of Object.entries(workflowVars)) {
                    resolved = resolved.replace(
                      new RegExp(`\\{\\{${varKey}\\}\\}`, 'g'),
                      varVal || '',
                    );
                  }
                }
                paramOverrides[key] = resolved;
              }
            }

            const toolResult = await this.toolExecutionService.execute(
              toolId,
              paramOverrides,
              {
                ticketId: context.ticketId,
                agentId: agent.id,
                variables: workflowVars,
              },
            );

            // Update workflow variables with response mappings
            if (toolResult.mappedVariables) {
              for (const [varName, varValue] of Object.entries(toolResult.mappedVariables)) {
                workflowVars[varName] = varValue;
              }
            }

            // Store tool output
            workflowVars['_lastOutput'] = toolResult.success
              ? JSON.stringify(toolResult.data)
              : toolResult.error || 'Tool execution failed';
            break;
          }
        }
      } catch (error) {
        this.logger.error(`Workflow step ${step.order} failed: ${(error as Error).message}`);
        throw error;
      }
    }

    return {
      reply: currentReply,
      agentId: agent.id,
      agentName: agent.name,
    };
  }
}
