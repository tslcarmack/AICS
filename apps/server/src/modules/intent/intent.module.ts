import { Module } from '@nestjs/common';
import { IntentController } from './intent.controller';
import { IntentService } from './intent.service';
import { IntentRecognitionService } from './intent-recognition.service';

@Module({
  controllers: [IntentController],
  providers: [IntentService, IntentRecognitionService],
  exports: [IntentService, IntentRecognitionService],
})
export class IntentModule {}
