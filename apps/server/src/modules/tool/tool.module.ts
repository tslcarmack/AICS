import { Module } from '@nestjs/common';
import { ToolController } from './tool.controller';
import { ToolService } from './tool.service';
import { ToolExecutionService } from './tool-execution.service';

@Module({
  controllers: [ToolController],
  providers: [ToolService, ToolExecutionService],
  exports: [ToolService, ToolExecutionService],
})
export class ToolModule {}
