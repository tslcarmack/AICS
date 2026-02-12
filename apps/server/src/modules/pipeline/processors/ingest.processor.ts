import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';

@Processor('pipeline-ingest')
export class IngestProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('pipeline-intent') private readonly intentQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<{ ticketId: string }>) {
    const { ticketId } = job.data;
    this.logger.log(`Ingest processing ticket: ${ticketId}`);

    try {
      // Update ticket status
      await this.prisma.ticket.update({
        where: { id: ticketId },
        data: { status: 'processing' },
      });

      // Update pipeline processing
      await this.prisma.pipelineProcessing.updateMany({
        where: { ticketId, stage: 'ingest' },
        data: { status: 'completed' },
      });

      // Create next stage record
      await this.prisma.pipelineProcessing.create({
        data: { ticketId, stage: 'intent', status: 'queued' },
      });

      // Add activity
      await this.prisma.ticketActivity.create({
        data: {
          ticketId,
          type: 'pipeline_stage',
          description: 'Ticket ingested, starting intent recognition',
        },
      });

      // Enqueue to intent recognition
      await this.intentQueue.add('process', { ticketId }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      });
    } catch (error) {
      this.logger.error(`Ingest failed: ${(error as Error).message}`);
      await this.prisma.pipelineProcessing.updateMany({
        where: { ticketId, stage: 'ingest' },
        data: { status: 'failed', error: (error as Error).message },
      });
      throw error;
    }
  }
}
