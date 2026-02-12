import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { AgentExecutionService } from './agent-execution.service';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { ToolModule } from '../tool/tool.module';

@Module({
  imports: [KnowledgeModule, ToolModule],
  controllers: [AgentController],
  providers: [AgentService, AgentExecutionService],
  exports: [AgentService, AgentExecutionService],
})
export class AgentModule {}
