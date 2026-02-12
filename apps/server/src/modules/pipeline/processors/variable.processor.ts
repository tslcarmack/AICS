import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { VariableExtractionService } from '../../variable/variable-extraction.service';

@Processor('pipeline-variable')
export class VariableProcessor extends WorkerHost {
  private readonly logger = new Logger(VariableProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly variableExtractionService: VariableExtractionService,
    @InjectQueue('pipeline-agent') private readonly agentQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<{ ticketId: string }>) {
    const { ticketId } = job.data;
    this.logger.log(`Variable extraction for ticket: ${ticketId}`);

    try {
      const ticket = await this.prisma.ticket.findUnique({
        where: { id: ticketId },
        include: {
          messages: { where: { direction: 'inbound' }, orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });

      if (!ticket || !ticket.messages[0]) {
        throw new Error('No customer message found');
      }

      const message = ticket.messages[0].content;
      const metadata = (ticket.metadata as Record<string, unknown>) || {};

      // Extract variables
      const results = await this.variableExtractionService.extractAll(
        message,
        metadata,
      );

      // Store extracted variables
      for (const result of results) {
        await this.prisma.ticketVariable.upsert({
          where: {
            ticketId_variableId: {
              ticketId,
              variableId: result.variableId,
            },
          },
          update: {
            value: result.value,
            extractionMethod: result.method,
          },
          create: {
            ticketId,
            variableId: result.variableId,
            value: result.value,
            extractionMethod: result.method,
          },
        });
      }

      const extracted = results.filter((r) => r.value);
      await this.prisma.pipelineProcessing.updateMany({
        where: { ticketId, stage: 'variable' },
        data: {
          status: 'completed',
          result: { extractedCount: extracted.length, total: results.length } as any,
        },
      });

      await this.prisma.ticketActivity.create({
        data: {
          ticketId,
          type: 'pipeline_stage',
          description: `Variables extracted: ${extracted.length}/${results.length}`,
        },
      });

      // Enqueue to agent processing
      await this.prisma.pipelineProcessing.create({
        data: { ticketId, stage: 'agent', status: 'queued' },
      });

      await this.agentQueue.add('process', { ticketId }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      });
    } catch (error) {
      this.logger.error(`Variable extraction failed: ${(error as Error).message}`);
      await this.prisma.pipelineProcessing.updateMany({
        where: { ticketId, stage: 'variable' },
        data: { status: 'failed', error: (error as Error).message },
      });
      throw error;
    }
  }
}
