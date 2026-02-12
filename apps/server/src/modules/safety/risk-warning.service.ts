import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../settings/llm.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface RiskWarning {
  type: string;
  severity: string;
  description: string;
}

@Injectable()
export class RiskWarningService {
  private readonly logger = new Logger(RiskWarningService.name);

  constructor(
    private readonly llmService: LlmService,
    private readonly prisma: PrismaService,
  ) {}

  async analyzeCustomerMessage(
    ticketId: string,
    message: string,
  ): Promise<RiskWarning[]> {
    try {
      const response = await this.llmService.chat(
        [
          {
            role: 'system',
            content: `You are a risk analyzer for customer service. Analyze the customer message for risk indicators:
1. Legal threats (e.g., "I will sue", "contact my lawyer")
2. Sensitive personal information (credit card numbers, SSN, passwords)
3. Fraud indicators (suspicious requests, social engineering)
4. Urgent escalation signals (extreme distress, safety concerns)

Respond with JSON array: [{"type": "legal_threat|sensitive_data|fraud|urgent", "severity": "low|medium|high|critical", "description": "explanation"}]
Return empty array [] if no risks found.`,
          },
          { role: 'user', content: `Customer message: "${message}"` },
        ],
        { temperature: 0 },
      );

      const warnings: RiskWarning[] = JSON.parse(response.content);

      // Log high-severity warnings
      for (const warning of warnings) {
        if (['high', 'critical'].includes(warning.severity)) {
          await this.prisma.safetyLog.create({
            data: {
              ticketId,
              violationType: `risk_${warning.type}`,
              details: warning.description,
              severity: warning.severity,
            },
          });
        }
      }

      return warnings;
    } catch (error) {
      this.logger.error(`Risk analysis failed: ${(error as Error).message}`);
      return [];
    }
  }
}
