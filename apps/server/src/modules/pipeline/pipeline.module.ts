import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PipelineController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';
import { IngestProcessor } from './processors/ingest.processor';
import { IntentProcessor } from './processors/intent.processor';
import { VariableProcessor } from './processors/variable.processor';
import { AgentProcessor } from './processors/agent.processor';
import { SafetyProcessor } from './processors/safety.processor';
import { IntentModule } from '../intent/intent.module';
import { VariableModule } from '../variable/variable.module';
import { AgentModule } from '../agent/agent.module';
import { SafetyModule } from '../safety/safety.module';
import { IntegrationModule } from '../integration/integration.module';
import { TicketModule } from '../ticket/ticket.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'pipeline-ingest' },
      { name: 'pipeline-intent' },
      { name: 'pipeline-variable' },
      { name: 'pipeline-agent' },
      { name: 'pipeline-safety' },
    ),
    IntentModule,
    VariableModule,
    AgentModule,
    SafetyModule,
    forwardRef(() => IntegrationModule),
    TicketModule,
  ],
  controllers: [PipelineController],
  providers: [
    PipelineService,
    IngestProcessor,
    IntentProcessor,
    VariableProcessor,
    AgentProcessor,
    SafetyProcessor,
  ],
  exports: [PipelineService],
})
export class PipelineModule {}
