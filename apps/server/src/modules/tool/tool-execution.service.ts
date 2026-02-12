import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ToolService } from './tool.service';
import axios, { AxiosError } from 'axios';
import type { ToolExecutionResult } from '@aics/shared';

export interface ToolExecutionContext {
  ticketId?: string;
  agentId?: string;
  variables?: Record<string, string | null>;
}

@Injectable()
export class ToolExecutionService {
  private readonly logger = new Logger(ToolExecutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly toolService: ToolService,
  ) {}

  /**
   * Execute a tool with the given parameters.
   * @param toolId - The tool to execute
   * @param params - Parameter values (from LLM or manual input)
   * @param context - Optional ticket/agent context for logging and variable mapping
   */
  async execute(
    toolId: string,
    params: Record<string, unknown>,
    context?: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    // 1. Load tool configuration (with decrypted auth)
    const tool = await this.toolService.findByIdRaw(toolId);

    if (!tool.enabled) {
      return this.logAndReturn(tool.id, context, params, startTime, {
        success: false,
        error: 'Tool is disabled',
        duration: Date.now() - startTime,
      });
    }

    try {
      // 2. Resolve parameter values (merge with variable bindings)
      const resolvedParams = this.resolveParameters(
        tool.parameters as any,
        params,
        context?.variables,
      );

      // 3. Build request
      const url = this.substituteVariables(tool.url || '', resolvedParams);
      const body = tool.bodyTemplate
        ? this.substituteVariablesInObject(tool.bodyTemplate, resolvedParams)
        : undefined;
      const headers = this.buildHeaders(
        tool.headers as Record<string, string> | null,
        tool.authType,
        tool.authConfig as Record<string, string> | null,
      );

      // 4. Execute HTTP request
      const response = await axios({
        method: (tool.method || 'GET').toLowerCase() as any,
        url,
        headers,
        data: body,
        timeout: tool.timeout || 30000,
        validateStatus: () => true, // Don't throw on non-2xx
      });

      // 5. Extract response data
      const responseData = response.data;
      const statusCode = response.status;
      const success = statusCode >= 200 && statusCode < 300;

      // 6. Apply response mappings
      const mappedVariables = await this.applyResponseMappings(
        tool.responseMapping as Record<string, string> | null,
        responseData,
        context,
      );

      const duration = Date.now() - startTime;
      return this.logAndReturn(tool.id, context, resolvedParams, startTime, {
        success,
        statusCode,
        data: responseData,
        duration,
        mappedVariables,
        error: success ? undefined : `HTTP ${statusCode}`,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      const errMsg =
        error instanceof AxiosError
          ? error.code === 'ECONNABORTED'
            ? `Timeout after ${tool.timeout || 30000}ms`
            : error.message
          : (error as Error).message;

      return this.logAndReturn(tool.id, context, params, startTime, {
        success: false,
        error: errMsg,
        duration,
        statusCode: error instanceof AxiosError ? error.response?.status : undefined,
        data: error instanceof AxiosError ? error.response?.data : undefined,
      });
    }
  }

  /**
   * Execute a tool for testing purposes (returns more detailed info).
   */
  async executeForTest(
    toolId: string,
    params: Record<string, unknown>,
  ): Promise<{
    result: ToolExecutionResult;
    request: { method: string; url: string; headers: Record<string, string>; body?: unknown };
  }> {
    const tool = await this.toolService.findByIdRaw(toolId);
    const startTime = Date.now();

    const resolvedParams = this.resolveParameters(
      tool.parameters as any,
      params,
      undefined,
    );

    const url = this.substituteVariables(tool.url || '', resolvedParams);
    const body = tool.bodyTemplate
      ? this.substituteVariablesInObject(tool.bodyTemplate, resolvedParams)
      : undefined;
    const headers = this.buildHeaders(
      tool.headers as Record<string, string> | null,
      tool.authType,
      tool.authConfig as Record<string, string> | null,
    );

    // Mask auth headers for display
    const maskedHeaders = { ...headers };
    if (maskedHeaders['Authorization']) {
      maskedHeaders['Authorization'] = maskedHeaders['Authorization'].substring(0, 15) + '****';
    }

    try {
      const response = await axios({
        method: (tool.method || 'GET').toLowerCase() as any,
        url,
        headers,
        data: body,
        timeout: tool.timeout || 30000,
        validateStatus: () => true,
      });

      const duration = Date.now() - startTime;
      const success = response.status >= 200 && response.status < 300;

      // Log the test execution
      await this.recordLog(tool.id, undefined, resolvedParams, {
        success,
        statusCode: response.status,
        data: response.data,
        duration,
      });

      return {
        result: {
          success,
          statusCode: response.status,
          data: response.data,
          duration,
          error: success ? undefined : `HTTP ${response.status}`,
        },
        request: {
          method: tool.method || 'GET',
          url,
          headers: maskedHeaders,
          body,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errMsg =
        error instanceof AxiosError
          ? error.code === 'ECONNABORTED'
            ? `Timeout after ${tool.timeout || 30000}ms`
            : error.message
          : (error as Error).message;

      await this.recordLog(tool.id, undefined, resolvedParams, {
        success: false,
        error: errMsg,
        duration,
        statusCode: error instanceof AxiosError ? error.response?.status : undefined,
      });

      return {
        result: {
          success: false,
          error: errMsg,
          duration,
          statusCode: error instanceof AxiosError ? error.response?.status : undefined,
          data: error instanceof AxiosError ? error.response?.data : undefined,
        },
        request: {
          method: tool.method || 'GET',
          url,
          headers: maskedHeaders,
          body,
        },
      };
    }
  }

  // ── Parameter Resolution ─────────────────────────────────────────

  /**
   * Resolve parameter values using priority:
   * 1. Explicitly provided values (from LLM or manual input)
   * 2. Variable binding values (from ticket context)
   * 3. Default values (not implemented in V1)
   */
  resolveParameters(
    schema: { type: string; properties?: Record<string, any>; required?: string[] } | null,
    providedParams: Record<string, unknown>,
    variables?: Record<string, string | null>,
  ): Record<string, unknown> {
    if (!schema?.properties) return providedParams;

    const resolved: Record<string, unknown> = {};

    for (const [paramName, paramDef] of Object.entries(schema.properties)) {
      // Priority 1: Explicitly provided
      if (providedParams[paramName] !== undefined && providedParams[paramName] !== null) {
        resolved[paramName] = providedParams[paramName];
        continue;
      }

      // Priority 2: Variable binding
      const variableBinding = paramDef.variableBinding;
      if (variableBinding && variables?.[variableBinding]) {
        resolved[paramName] = variables[variableBinding];
        continue;
      }

      // If required and not resolved, leave it for error handling downstream
      if (schema.required?.includes(paramName)) {
        // Keep as undefined - the caller should handle missing required params
      }
    }

    return resolved;
  }

  // ── Variable Substitution ────────────────────────────────────────

  private substituteVariables(
    template: string,
    params: Record<string, unknown>,
  ): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const value = params[key];
      return value !== undefined && value !== null ? String(value) : '';
    });
  }

  private substituteVariablesInObject(
    obj: unknown,
    params: Record<string, unknown>,
  ): unknown {
    if (typeof obj === 'string') {
      return this.substituteVariables(obj, params);
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.substituteVariablesInObject(item, params));
    }
    if (obj && typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.substituteVariablesInObject(value, params);
      }
      return result;
    }
    return obj;
  }

  // ── Headers & Auth ───────────────────────────────────────────────

  private buildHeaders(
    customHeaders: Record<string, string> | null,
    authType: string | null,
    authConfig: Record<string, string> | null,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(customHeaders || {}),
    };

    if (!authType || authType === 'none' || !authConfig) return headers;

    switch (authType) {
      case 'bearer':
        if (authConfig.token) {
          headers['Authorization'] = `Bearer ${authConfig.token}`;
        }
        break;
      case 'api_key':
        if (authConfig.headerName && authConfig.headerValue) {
          headers[authConfig.headerName] = authConfig.headerValue;
        }
        break;
      case 'basic':
        if (authConfig.username && authConfig.password) {
          const encoded = Buffer.from(
            `${authConfig.username}:${authConfig.password}`,
          ).toString('base64');
          headers['Authorization'] = `Basic ${encoded}`;
        }
        break;
    }

    return headers;
  }

  // ── Response Mapping ─────────────────────────────────────────────

  private async applyResponseMappings(
    mappings: Record<string, string> | null,
    responseData: unknown,
    context?: ToolExecutionContext,
  ): Promise<Record<string, string> | undefined> {
    if (!mappings || !context?.ticketId) return undefined;

    const result: Record<string, string> = {};

    for (const [jsonPath, variableName] of Object.entries(mappings)) {
      try {
        const value = this.extractJsonPath(responseData, jsonPath);
        if (value === undefined || value === null) {
          this.logger.warn(
            `Response mapping: path "${jsonPath}" returned no value`,
          );
          continue;
        }

        const strValue = typeof value === 'string' ? value : JSON.stringify(value);

        // Find the variable definition
        const variable = await this.prisma.variable.findUnique({
          where: { name: variableName },
        });

        if (!variable) {
          this.logger.warn(
            `Response mapping: variable "${variableName}" not found in system`,
          );
          continue;
        }

        // Upsert ticket variable
        await this.prisma.ticketVariable.upsert({
          where: {
            ticketId_variableId: {
              ticketId: context.ticketId,
              variableId: variable.id,
            },
          },
          update: {
            value: strValue,
            extractionMethod: 'tool',
          },
          create: {
            ticketId: context.ticketId,
            variableId: variable.id,
            value: strValue,
            extractionMethod: 'tool',
          },
        });

        result[variableName] = strValue;
      } catch (error) {
        this.logger.warn(
          `Response mapping error for "${jsonPath}" -> "${variableName}": ${(error as Error).message}`,
        );
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  /**
   * Simple JSON path extractor supporting dot notation and `$.` prefix.
   * e.g., "$.data.status" or "data.status"
   */
  private extractJsonPath(data: unknown, path: string): unknown {
    // Strip leading $. if present
    const cleanPath = path.startsWith('$.') ? path.substring(2) : path;
    const parts = cleanPath.split('.');

    let current: any = data;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      // Handle array index: e.g., "items[0]"
      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        current = current[arrayMatch[1]];
        if (Array.isArray(current)) {
          current = current[parseInt(arrayMatch[2], 10)];
        } else {
          return undefined;
        }
      } else {
        current = current[part];
      }
    }
    return current;
  }

  // ── Logging ──────────────────────────────────────────────────────

  private async logAndReturn(
    toolId: string,
    context: ToolExecutionContext | undefined,
    input: Record<string, unknown>,
    startTime: number,
    result: ToolExecutionResult,
  ): Promise<ToolExecutionResult> {
    await this.recordLog(toolId, context, input, result);
    return result;
  }

  private async recordLog(
    toolId: string,
    context: ToolExecutionContext | undefined,
    input: Record<string, unknown>,
    result: Partial<ToolExecutionResult>,
  ): Promise<void> {
    try {
      await this.prisma.toolExecutionLog.create({
        data: {
          toolId,
          ticketId: context?.ticketId,
          agentId: context?.agentId,
          input: input as any,
          output: result.data !== undefined ? (result.data as any) : null,
          statusCode: result.statusCode,
          duration: result.duration || 0,
          success: result.success || false,
          error: result.error,
        },
      });
    } catch (error) {
      this.logger.error('Failed to record tool execution log', (error as Error).message);
    }
  }

  // ── Execution Logs Query ─────────────────────────────────────────

  async getExecutionLogs(
    toolId: string,
    page = 1,
    pageSize = 20,
  ) {
    const [items, total] = await Promise.all([
      this.prisma.toolExecutionLog.findMany({
        where: { toolId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          ticket: { select: { id: true, subject: true } },
          agent: { select: { id: true, name: true } },
        },
      }),
      this.prisma.toolExecutionLog.count({ where: { toolId } }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
