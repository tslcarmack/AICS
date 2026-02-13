import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { SettingsModule } from './modules/settings/settings.module';
import { IntegrationModule } from './modules/integration/integration.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { IntentModule } from './modules/intent/intent.module';
import { VariableModule } from './modules/variable/variable.module';
import { AgentModule } from './modules/agent/agent.module';
import { SafetyModule } from './modules/safety/safety.module';
import { TicketModule } from './modules/ticket/ticket.module';
import { PipelineModule } from './modules/pipeline/pipeline.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ToolModule } from './modules/tool/tool.module';
import { TagModule } from './modules/tag/tag.module';
import { I18nModule } from './i18n/i18n.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    I18nModule,
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
        },
      }),
      inject: [ConfigService],
    }),
    PrismaModule,
    AuthModule,
    SettingsModule,
    IntegrationModule,
    KnowledgeModule,
    IntentModule,
    VariableModule,
    ToolModule,
    TagModule,
    AgentModule,
    SafetyModule,
    TicketModule,
    PipelineModule,
    AnalyticsModule,
  ],
})
export class AppModule {}
