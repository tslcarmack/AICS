import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmService } from '../settings/llm.service';
import { VariableService } from './variable.service';

export interface ExtractionResult {
  variableId: string;
  variableName: string;
  value: string | null;
  method: 'auto_sync' | 'keyword' | 'smart' | 'not_extracted';
}

@Injectable()
export class VariableExtractionService {
  private readonly logger = new Logger(VariableExtractionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
    private readonly variableService: VariableService,
  ) {}

  async extractAll(
    message: string,
    metadata?: Record<string, unknown>,
  ): Promise<ExtractionResult[]> {
    const variables = await this.variableService.getAllVariables();
    const results: ExtractionResult[] = [];

    for (const variable of variables) {
      const result = await this.extractVariable(variable, message, metadata);
      results.push(result);
    }

    return results;
  }

  private async extractVariable(
    variable: any,
    message: string,
    metadata?: Record<string, unknown>,
  ): Promise<ExtractionResult> {
    const base = {
      variableId: variable.id,
      variableName: variable.name,
    };

    // Tier 1: Auto-sync from metadata
    if (metadata && metadata[variable.name] !== undefined) {
      return {
        ...base,
        value: String(metadata[variable.name]),
        method: 'auto_sync',
      };
    }

    // Tier 2: Keyword matching
    const keywordResult = this.keywordMatch(variable, message);
    if (keywordResult) {
      return {
        ...base,
        value: keywordResult,
        method: 'keyword',
      };
    }

    // Tier 3: Smart extraction via LLM
    if (variable.smartExtractionEnabled) {
      const smartResult = await this.smartExtract(variable, message);
      if (smartResult) {
        return {
          ...base,
          value: smartResult,
          method: 'smart',
        };
      }
    }

    return {
      ...base,
      value: null,
      method: 'not_extracted',
    };
  }

  private keywordMatch(variable: any, message: string): string | null {
    const lowerMessage = message.toLowerCase();

    // For list-type variables, check list items' keywords
    if (variable.type === 'list' && variable.listItems) {
      for (const item of variable.listItems) {
        const keywords = (item.keywords as string[]) || [];
        for (const keyword of keywords) {
          if (lowerMessage.includes(keyword.toLowerCase())) {
            return item.value;
          }
        }
      }
    }

    // For value-type variables, check variable-level keywords
    const keywords = (variable.keywords as string[]) || [];
    for (const keyword of keywords) {
      const regex = new RegExp(keyword, 'i');
      const match = message.match(regex);
      if (match) {
        return match[0];
      }
    }

    return null;
  }

  private async smartExtract(
    variable: any,
    message: string,
  ): Promise<string | null> {
    try {
      const instruction =
        variable.extractionInstruction ||
        `Extract the value of "${variable.name}" from the message.`;

      let prompt = `${instruction}\n\nCustomer message: "${message}"\n\n`;

      if (variable.type === 'list' && variable.listItems) {
        const options = variable.listItems
          .map((item: any) => `- ${item.value}${item.description ? `: ${item.description}` : ''}`)
          .join('\n');
        prompt += `Possible values:\n${options}\n\n`;
      }

      prompt += `Respond with ONLY the extracted value, or "NONE" if not found.`;

      const response = await this.llmService.chat(
        [
          {
            role: 'system',
            content: 'You are a variable extraction assistant. Extract the requested value from the customer message. Respond with only the value or "NONE".',
          },
          { role: 'user', content: prompt },
        ],
        { temperature: 0 },
      );

      const value = response.content.trim();
      if (value === 'NONE' || value === '' || value === 'null') {
        return null;
      }
      return value;
    } catch (error) {
      this.logger.error(
        `Smart extraction failed for ${variable.name}: ${(error as Error).message}`,
      );
      return null;
    }
  }
}
