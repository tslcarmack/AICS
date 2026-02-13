import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IntentService } from './intent.service';
import { IntentRecognitionService } from './intent-recognition.service';

@Controller('intents')
@UseGuards(AuthGuard('jwt'))
export class IntentController {
  constructor(
    private readonly intentService: IntentService,
    private readonly recognitionService: IntentRecognitionService,
  ) {}

  @Get()
  list() {
    return this.intentService.list();
  }

  @Post()
  create(
    @Body()
    body: {
      name: string;
      description?: string;
      exampleUtterances?: string[];
      keywords?: string[];
      actions?: Array<{ type: string; config?: any; order?: number }>;
    },
  ) {
    return this.intentService.create(body);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      exampleUtterances?: string[];
      keywords?: string[];
      actions?: Array<{ type: string; config?: any; order?: number }>;
    },
  ) {
    return this.intentService.update(id, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.intentService.delete(id);
  }

  @Post(':id/toggle')
  toggle(@Param('id') id: string) {
    return this.intentService.toggle(id);
  }

  @Put(':id/bind-agent')
  bindAgent(@Param('id') id: string, @Body() body: { agentId: string | null }) {
    return this.intentService.bindAgent(id, body.agentId);
  }

  @Post('test')
  test(@Body() body: { message: string }) {
    return this.recognitionService.recognize(body.message);
  }
}
