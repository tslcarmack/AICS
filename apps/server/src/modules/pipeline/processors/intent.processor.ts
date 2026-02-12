import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { IntentRecognitionService } from '../../intent/intent-recognition.service';
import { TicketService } from '../../ticket/ticket.service';

@Processor('pipeline-intent')
export class IntentProcessor extends WorkerHost {
  private readonly logger = new Logger(IntentProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly intentRecognitionService: IntentRecognitionService,
    private readonly ticketService: TicketService,
    @InjectQueue('pipeline-variable') private readonly variableQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<{ ticketId: string }>) {
    const { ticketId } = job.data;
    this.logger.log(`Intent recognition for ticket: ${ticketId}`);

    try {
      // Get the customer message
      const ticket = await this.prisma.ticket.findUnique({
        where: { id: ticketId },
        include: { messages: { where: { direction: 'inbound' }, orderBy: { createdAt: 'desc' }, take: 1 } },
      });

      if (!ticket || !ticket.messages[0]) {
        throw new Error('No customer message found');
      }

      const message = ticket.messages[0].content;

      // Recognize intent
      const result = await this.intentRecognitionService.recognize(message);

      // Update ticket with intent
      await this.prisma.ticket.update({
        where: { id: ticketId },
        data: {
          intentId: result.intentId,
          agentId: result.intentId
            ? (await this.prisma.intent.findUnique({ where: { id: result.intentId } }))?.boundAgentId
            : null,
        },
      });

      await this.prisma.pipelineProcessing.updateMany({
        where: { ticketId, stage: 'intent' },
        data: {
          status: 'completed',
          result: { intentName: result.intentName, confidence: result.confidence } as any,
        },
      });

      await this.prisma.ticketActivity.create({
        data: {
          ticketId,
          type: 'pipeline_stage',
          description: `Intent recognized: ${result.intentName} (confidence: ${result.confidence})`,
        },
      });

      // If unknown intent or no bound agent, escalate
      if (!result.intentId || result.intentName === 'unknown') {
        await this.prisma.ticket.update({
          where: { id: ticketId },
          data: { status: 'escalated' },
        });
        await this.ticketService.autoAssign(ticketId);
        await this.prisma.pipelineProcessing.create({
          data: { ticketId, stage: 'agent', status: 'escalated' },
        });
        return;
      }

      // Enqueue to variable extraction
      await this.prisma.pipelineProcessing.create({
        data: { ticketId, stage: 'variable', status: 'queued' },
      });

      await this.variableQueue.add('process', { ticketId }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      });
    } catch (error) {
      this.logger.error(`Intent recognition failed: ${(error as Error).message}`);
      await this.prisma.pipelineProcessing.updateMany({
        where: { ticketId, stage: 'intent' },
        data: { status: 'failed', error: (error as Error).message },
      });
      throw error;
    }
  }
}
