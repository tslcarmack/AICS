import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../settings/llm.service';
import { IntentService } from './intent.service';

export interface RecognitionResult {
  intentId: string | null;
  intentName: string;
  confidence: number;
  alternatives: Array<{ intentId: string; intentName: string; confidence: number }>;
}

@Injectable()
export class IntentRecognitionService {
  private readonly logger = new Logger(IntentRecognitionService.name);

  constructor(
    private readonly llmService: LlmService,
    private readonly intentService: IntentService,
  ) {}

  async recognize(message: string): Promise<RecognitionResult> {
    const intents = await this.intentService.getEnabledIntents();

    if (intents.length === 0) {
      return {
        intentId: null,
        intentName: 'unknown',
        confidence: 0,
        alternatives: [],
      };
    }

    // Build intent list for prompt
    const intentList = intents
      .map((intent, i) => {
        const examples = (intent.exampleUtterances as string[]) || [];
        return `${i + 1}. "${intent.name}" - ${intent.description || 'No description'}${
          examples.length > 0 ? `\n   Examples: ${examples.slice(0, 3).join('; ')}` : ''
        }`;
      })
      .join('\n');

    const prompt = `You are an intent classifier for a customer service system. Classify the following customer message into one of the intents listed below.

Available intents:
${intentList}

Customer message: "${message}"

Respond in JSON format only:
{
  "intent": "<exact intent name>",
  "confidence": <0.0 to 1.0>,
  "alternatives": [{"intent": "<name>", "confidence": <score>}]
}

If no intent matches well, use intent "unknown" with a low confidence score.`;

    try {
      const response = await this.llmService.chat(
        [
          { role: 'system', content: 'You are an intent classifier. Always respond with valid JSON.' },
          { role: 'user', content: prompt },
        ],
        { temperature: 0.1 },
      );

      const parsed = JSON.parse(response.content);
      const matchedIntent = intents.find(
        (i) => i.name.toLowerCase() === parsed.intent?.toLowerCase(),
      );

      return {
        intentId: matchedIntent?.id || null,
        intentName: parsed.intent || 'unknown',
        confidence: parsed.confidence || 0,
        alternatives: (parsed.alternatives || []).map((alt: any) => {
          const altIntent = intents.find(
            (i) => i.name.toLowerCase() === alt.intent?.toLowerCase(),
          );
          return {
            intentId: altIntent?.id || null,
            intentName: alt.intent,
            confidence: alt.confidence,
          };
        }),
      };
    } catch (error) {
      this.logger.error(`Intent recognition failed: ${(error as Error).message}`);
      return {
        intentId: null,
        intentName: 'unknown',
        confidence: 0,
        alternatives: [],
      };
    }
  }
}
