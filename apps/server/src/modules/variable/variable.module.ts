import { Module } from '@nestjs/common';
import { VariableController } from './variable.controller';
import { VariableService } from './variable.service';
import { VariableExtractionService } from './variable-extraction.service';

@Module({
  controllers: [VariableController],
  providers: [VariableService, VariableExtractionService],
  exports: [VariableService, VariableExtractionService],
})
export class VariableModule {}
