import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmService } from '../settings/llm.service';

export interface SafetyCheckResult {
  passed: boolean;
  violations: Array<{
    ruleId: string;
    ruleName: string;
    violationType: string;
    details: string;
    severity: string;
    action: string;
  }>;
}

@Injectable()
export class SafetyCheckService {
  private readonly logger = new Logger(SafetyCheckService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
  ) {}

  async checkReply(
    ticketId: string,
    replyContent: string,
    customerMessage: string,
    conversationHistory?: string[],
  ): Promise<SafetyCheckResult> {
    const rules = await this.prisma.safetyRule.findMany({
      where: { enabled: true },
    });

    const violations: SafetyCheckResult['violations'] = [];

    for (const rule of rules) {
      try {
        let violated = false;
        let details = '';

        switch (rule.checkType) {
          case 'keyword': {
            const keywords = rule.pattern?.split(',').map((k) => k.trim()) || [];
            for (const keyword of keywords) {
              if (replyContent.toLowerCase().includes(keyword.toLowerCase())) {
                violated = true;
                details = `Reply contains keyword: "${keyword}"`;
                break;
              }
            }

            // Special: Repeated response check
            if (rule.name.includes('Repeated') && conversationHistory) {
              const threshold = 3;
              const replyLower = replyContent.toLowerCase().trim();
              const repeatCount = conversationHistory.filter(
                (h) => h.toLowerCase().trim() === replyLower,
              ).length;
              if (repeatCount >= threshold) {
                violated = true;
                details = `Reply repeated ${repeatCount} times (threshold: ${threshold})`;
              }
            }
            break;
          }

          case 'regex': {
            if (rule.pattern) {
              const regex = new RegExp(rule.pattern, 'gi');
              const match = replyContent.match(regex);
              if (match) {
                violated = true;
                details = `Reply matches regex pattern: ${match[0]}`;
              }
            }
            break;
          }

          case 'llm': {
            const result = await this.llmCheckRule(
              rule,
              replyContent,
              customerMessage,
            );
            violated = result.violated;
            details = result.details;
            break;
          }
        }

        if (violated) {
          violations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            violationType: rule.name,
            details,
            severity: rule.severity,
            action: rule.action,
          });

          // Log the violation
          await this.prisma.safetyLog.create({
            data: {
              ticketId,
              ruleId: rule.id,
              violationType: rule.name,
              details,
              severity: rule.severity,
            },
          });
        }
      } catch (error) {
        this.logger.error(
          `Safety check failed for rule ${rule.name}: ${(error as Error).message}`,
        );
      }
    }

    const hasBlockingViolation = violations.some(
      (v) => v.action === 'block' || v.action === 'escalate',
    );

    return {
      passed: !hasBlockingViolation,
      violations,
    };
  }

  private async llmCheckRule(
    rule: any,
    replyContent: string,
    customerMessage: string,
  ): Promise<{ violated: boolean; details: string }> {
    const checkPrompts: Record<string, string> = {
      'Fabricated Link Check': `Check if this customer service reply contains any URLs or email addresses that seem fabricated (not from a legitimate knowledge base). Reply content: "${replyContent}"`,
      'Fabricated Escalation Check': `Check if this reply claims to have escalated the issue to a human agent. If it does, flag it as a potential fabrication. Reply: "${replyContent}"`,
      'Invalid Help Check': `Check if this reply contains unhelpful phrases like "unable to assist", "cannot help", "no further solutions". Reply: "${replyContent}"`,
      'Customer Service Stance Check': `Check if this reply contains unprofessional content like "I don't have knowledge to solve this" or language that may upset the customer. Reply: "${replyContent}"`,
      'Service Attitude Check': `Check if this reply contains any rude, threatening, sarcastic, or aggressive language. Reply: "${replyContent}"`,
      'Language Consistency Check': `Customer message language: "${customerMessage}". Reply language: "${replyContent}". Check if the reply is in the same language as the customer message. If the customer language cannot be determined, English is acceptable.`,
    };

    const prompt =
      checkPrompts[rule.name] ||
      rule.pattern ||
      `Check this reply for the following issue: ${rule.description}. Reply: "${replyContent}"`;

    try {
      const response = await this.llmService.chat(
        [
          {
            role: 'system',
            content:
              'You are a safety checker. Analyze the given content and respond with JSON: {"violated": true/false, "details": "explanation"}',
          },
          { role: 'user', content: prompt },
        ],
        { temperature: 0 },
      );

      const parsed = JSON.parse(response.content);
      return {
        violated: parsed.violated || false,
        details: parsed.details || '',
      };
    } catch {
      return { violated: false, details: 'Check failed to parse' };
    }
  }
}
