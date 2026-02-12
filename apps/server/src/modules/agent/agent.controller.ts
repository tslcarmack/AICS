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
import { AgentService } from './agent.service';

@Controller('agents')
@UseGuards(AuthGuard('jwt'))
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Get()
  list() {
    return this.agentService.list();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.agentService.getById(id);
  }

  @Post()
  create(
    @Body()
    body: {
      name: string;
      description?: string;
      type: string;
      systemPrompt?: string;
      modelId?: string;
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      toolConfig?: any;
      knowledgeBaseIds?: string[];
      toolIds?: string[];
    },
  ) {
    return this.agentService.create(body);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      systemPrompt?: string;
      modelId?: string;
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      toolConfig?: any;
      knowledgeBaseIds?: string[];
      toolIds?: string[];
    },
  ) {
    return this.agentService.update(id, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.agentService.delete(id);
  }

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string) {
    return this.agentService.duplicate(id);
  }

  @Post(':id/toggle')
  toggle(@Param('id') id: string) {
    return this.agentService.toggle(id);
  }

  // Workflow steps
  @Get(':id/steps')
  getSteps(@Param('id') id: string) {
    return this.agentService.getSteps(id);
  }

  @Post(':id/steps')
  createStep(
    @Param('id') id: string,
    @Body() body: { order: number; type: string; config: any },
  ) {
    return this.agentService.createStep(id, body);
  }

  @Put('steps/:stepId')
  updateStep(
    @Param('stepId') stepId: string,
    @Body() body: { type?: string; config?: any; order?: number },
  ) {
    return this.agentService.updateStep(stepId, body);
  }

  @Delete('steps/:stepId')
  deleteStep(@Param('stepId') stepId: string) {
    return this.agentService.deleteStep(stepId);
  }
}
