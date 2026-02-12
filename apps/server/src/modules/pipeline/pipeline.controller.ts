import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PipelineService } from './pipeline.service';

@Controller('pipeline')
@UseGuards(AuthGuard('jwt'))
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  @Get('processings')
  listProcessings(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('status') status?: string,
  ) {
    return this.pipelineService.listProcessings(page, pageSize, status);
  }

  @Post(':id/retry')
  retryProcessing(@Param('id') id: string) {
    return this.pipelineService.retryProcessing(id);
  }

  @Get('config')
  getConfig() {
    return this.pipelineService.getConfig();
  }

  @Put('config')
  updateConfig(@Body() body: Record<string, unknown>) {
    return this.pipelineService.updateConfig(body);
  }
}
