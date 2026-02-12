import { Global, Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { LlmService } from './llm.service';

@Global()
@Module({
  controllers: [SettingsController],
  providers: [SettingsService, LlmService],
  exports: [SettingsService, LlmService],
})
export class SettingsModule {}
