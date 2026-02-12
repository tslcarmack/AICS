import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ToolService } from './tool.service';
import { ToolExecutionService } from './tool-execution.service';

@Controller('tools')
@UseGuards(AuthGuard('jwt'))
export class ToolController {
  constructor(
    private readonly toolService: ToolService,
    private readonly toolExecutionService: ToolExecutionService,
  ) {}

  @Get()
  list() {
    return this.toolService.findAll();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.toolService.findById(id);
  }

  @Post()
  create(
    @Body()
    body: {
      name: string;
      displayName: string;
      description: string;
      type: string;
      method?: string;
      url?: string;
      headers?: Record<string, string>;
      bodyTemplate?: unknown;
      authType?: string;
      authConfig?: Record<string, string>;
      parameters: Record<string, unknown>;
      responseMapping?: Record<string, string>;
      timeout?: number;
    },
  ) {
    return this.toolService.create(body);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      displayName?: string;
      description?: string;
      type?: string;
      method?: string;
      url?: string;
      headers?: Record<string, string>;
      bodyTemplate?: unknown;
      authType?: string;
      authConfig?: Record<string, string>;
      parameters?: Record<string, unknown>;
      responseMapping?: Record<string, string>;
      timeout?: number;
    },
  ) {
    return this.toolService.update(id, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.toolService.delete(id);
  }

  @Post(':id/toggle')
  toggle(@Param('id') id: string) {
    return this.toolService.toggle(id);
  }

  @Post(':id/test')
  test(
    @Param('id') id: string,
    @Body() body: { parameters: Record<string, unknown> },
  ) {
    return this.toolExecutionService.executeForTest(id, body.parameters || {});
  }

  @Get(':id/logs')
  getLogs(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.toolExecutionService.getExecutionLogs(
      id,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
    );
  }
}
