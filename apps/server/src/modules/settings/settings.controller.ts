import { Controller, Get, Put, Body, UseGuards, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SettingsService } from './settings.service';
import { LlmService } from './llm.service';

/** LLM-related setting keys (camelCase, matching frontend) */
const LLM_KEYS = [
  'llmApiKey',
  'llmApiBaseUrl',
  'llmModel',
  'llmEmbeddingModel',
];

@Controller('settings')
@UseGuards(AuthGuard('jwt'))
export class SettingsController {
  private readonly logger = new Logger(SettingsController.name);

  constructor(
    private readonly settingsService: SettingsService,
    private readonly llmService: LlmService,
  ) {}

  @Get()
  async getAll() {
    return this.settingsService.getAll();
  }

  /**
   * Debug endpoint: shows the resolved LLM config (with masked API key).
   */
  @Get('llm-debug')
  async llmDebug() {
    const allSettings = await this.settingsService.getAll();
    const resolved = await this.llmService.getResolvedConfig();

    // Show what's in the DB for each LLM key (mask sensitive values)
    const dbValues: Record<string, string> = {};
    for (const key of LLM_KEYS) {
      const val = allSettings[key] as string | undefined;
      if (key === 'llmApiKey' && val) {
        dbValues[key] = `${val.slice(0, 6)}...${val.slice(-4)}`;
      } else {
        dbValues[key] = val ?? '(not set)';
      }
    }

    return { dbValues, resolved };
  }

  @Put()
  async update(@Body() body: Record<string, unknown>) {
    // Log what's being saved (mask API key)
    const logBody = { ...body };
    if (logBody.llmApiKey) {
      const key = String(logBody.llmApiKey);
      logBody.llmApiKey = `${key.slice(0, 6)}...${key.slice(-4)}`;
    }
    this.logger.log(`Saving settings: ${JSON.stringify(logBody)}`);

    await this.settingsService.updateMany(body);

    // Reset LLM client cache if any LLM setting was changed
    if (Object.keys(body).some((k) => LLM_KEYS.includes(k))) {
      this.llmService.resetClient();
      this.logger.log('LLM client reset after settings update');
    }

    return { success: true };
  }
}
