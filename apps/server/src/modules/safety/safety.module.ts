import { Module } from '@nestjs/common';
import { SafetyController } from './safety.controller';
import { SafetyService } from './safety.service';
import { SafetyCheckService } from './safety-check.service';
import { RiskWarningService } from './risk-warning.service';

@Module({
  controllers: [SafetyController],
  providers: [SafetyService, SafetyCheckService, RiskWarningService],
  exports: [SafetyService, SafetyCheckService, RiskWarningService],
})
export class SafetyModule {}
