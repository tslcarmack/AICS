import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeRetrievalService } from './knowledge-retrieval.service';
import { KnowledgeProcessorService } from './knowledge-processor.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'knowledge-processing' }),
  ],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, KnowledgeRetrievalService, KnowledgeProcessorService],
  exports: [KnowledgeService, KnowledgeRetrievalService],
})
export class KnowledgeModule {}
