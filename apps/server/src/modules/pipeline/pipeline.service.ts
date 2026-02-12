import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import {
  parsePagination,
  paginatedResponse,
} from '../../common/helpers/pagination.helper';

@Injectable()
export class PipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    @InjectQueue('pipeline-ingest') private readonly ingestQueue: Queue,
  ) {}

  async enqueueTicket(ticketId: string) {
    await this.prisma.pipelineProcessing.create({
      data: {
        ticketId,
        stage: 'ingest',
        status: 'queued',
      },
    });

    await this.ingestQueue.add('process', { ticketId }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }

  async listProcessings(page?: number, pageSize?: number, status?: string) {
    const pagination = parsePagination(page, pageSize);
    const where: any = {};
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.pipelineProcessing.findMany({
        where,
        include: {
          ticket: {
            select: {
              id: true,
              subject: true,
              customerEmail: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.pipelineProcessing.count({ where }),
    ]);

    return paginatedResponse(items, total, pagination);
  }

  async retryProcessing(id: string) {
    const processing = await this.prisma.pipelineProcessing.findUnique({
      where: { id },
    });
    if (!processing) throw new Error('Processing not found');

    await this.prisma.pipelineProcessing.update({
      where: { id },
      data: { status: 'queued', error: null },
    });

    await this.ingestQueue.add('process', { ticketId: processing.ticketId }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });

    return { success: true };
  }

  async getConfig() {
    return {
      autoReplyEnabled: await this.settingsService.get('auto_reply_enabled', true),
      safetyStrictness: await this.settingsService.get('safety_strictness', 'normal'),
      maxRetries: await this.settingsService.get('pipeline_max_retries', 3),
      timeoutMs: await this.settingsService.get('pipeline_timeout_ms', 300000),
    };
  }

  async updateConfig(config: Record<string, unknown>) {
    await this.settingsService.updateMany(config);
    return { success: true };
  }
}
