import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
@UseGuards(AuthGuard('jwt'))
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  getOverview() {
    return this.analyticsService.getOverview();
  }

  @Get('volume')
  getVolume(@Query('days') days?: number) {
    return this.analyticsService.getVolume(days || 30);
  }

  @Get('intents')
  getIntentDistribution() {
    return this.analyticsService.getIntentDistribution();
  }

  @Get('pipeline')
  getPipelineStats() {
    return this.analyticsService.getPipelineStats();
  }
}
