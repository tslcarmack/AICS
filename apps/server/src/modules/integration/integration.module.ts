import { Module, forwardRef } from '@nestjs/common';
import { IntegrationController } from './integration.controller';
import { IntegrationService } from './integration.service';
import { EmailPollingService } from './email-polling.service';
import { EmailSendService } from './email-send.service';
import { PipelineModule } from '../pipeline/pipeline.module';

@Module({
  imports: [forwardRef(() => PipelineModule)],
  controllers: [IntegrationController],
  providers: [IntegrationService, EmailPollingService, EmailSendService],
  exports: [IntegrationService, EmailPollingService, EmailSendService],
})
export class IntegrationModule {}
