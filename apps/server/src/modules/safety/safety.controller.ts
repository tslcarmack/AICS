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
import { SafetyService } from './safety.service';

@Controller('safety')
@UseGuards(AuthGuard('jwt'))
export class SafetyController {
  constructor(private readonly safetyService: SafetyService) {}

  @Get('overview')
  getOverview(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.safetyService.getOverview(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('rules')
  listRules() {
    return this.safetyService.listRules();
  }

  @Post('rules')
  createRule(
    @Body()
    body: {
      name: string;
      description?: string;
      checkType: string;
      pattern?: string;
      severity?: string;
      action?: string;
    },
  ) {
    return this.safetyService.createRule(body);
  }

  @Put('rules/:id')
  updateRule(@Param('id') id: string, @Body() body: any) {
    return this.safetyService.updateRule(id, body);
  }

  @Delete('rules/:id')
  deleteRule(@Param('id') id: string) {
    return this.safetyService.deleteRule(id);
  }

  @Post('rules/:id/toggle')
  toggleRule(@Param('id') id: string) {
    return this.safetyService.toggleRule(id);
  }

  @Get('logs')
  listLogs(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('ticketId') ticketId?: string,
  ) {
    return this.safetyService.listLogs(page, pageSize, ticketId);
  }

  @Get('alerts/config')
  getAlertConfig() {
    return this.safetyService.getAlertConfig();
  }

  @Put('alerts/config')
  updateAlertConfig(@Body() body: any) {
    return this.safetyService.updateAlertConfig(body);
  }
}
