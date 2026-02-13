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
        data: { intentId: result.intentId },
      });

      await this.prisma.ticketActivity.create({
        data: {
          ticketId,
          type: 'pipeline_stage',
          description: `Intent recognized: ${result.intentName} (confidence: ${result.confidence})`,
        },
      });

      // If unknown intent, escalate
      if (!result.intentId || result.intentName === 'unknown') {
        await this.escalateTicket(ticketId, result);
        return;
      }

      // Load intent actions
      const actions = await this.prisma.intentAction.findMany({
        where: { intentId: result.intentId },
        orderBy: { order: 'asc' },
      });

      // Fallback: if no actions, check legacy boundAgentId
      if (actions.length === 0) {
        const intent = await this.prisma.intent.findUnique({
          where: { id: result.intentId },
        });
        if (intent?.boundAgentId) {
          this.logger.log(`Ticket ${ticketId}: using legacy boundAgentId fallback`);
          await this.prisma.ticket.update({
            where: { id: ticketId },
            data: { agentId: intent.boundAgentId },
          });
          await this.completePipelineStage(ticketId, result, [{ type: 'execute_agent (legacy)', config: {} }]);
          await this.enqueueVariable(ticketId);
          return;
        }
        // No actions and no legacy agent → escalate
        this.logger.log(`Ticket ${ticketId}: intent "${result.intentName}" has no actions, escalating`);
        await this.escalateTicket(ticketId, result);
        return;
      }

      // Execute actions in order
      const executedActions: Array<{ type: string; config: any }> = [];
      let pipelineContinues = false;

      for (const action of actions) {
        const config = (action.config as any) || {};

        switch (action.type) {
          case 'add_tag': {
            if (config.tagId) {
              await this.prisma.ticketTag.upsert({
                where: { ticketId_tagId: { ticketId, tagId: config.tagId } },
                update: {},
                create: { ticketId, tagId: config.tagId },
              });
              this.logger.log(`Ticket ${ticketId}: added tag ${config.tagId}`);
            }
            executedActions.push({ type: 'add_tag', config });
            break;
          }

          case 'execute_agent': {
            if (config.agentId) {
              await this.prisma.ticket.update({
                where: { id: ticketId },
                data: { agentId: config.agentId },
              });
              this.logger.log(`Ticket ${ticketId}: assigned agent ${config.agentId}`);
            }
            executedActions.push({ type: 'execute_agent', config });
            pipelineContinues = true;
            // execute_agent breaks the action loop — pipeline continues to variable stage
            await this.completePipelineStage(ticketId, result, executedActions);
            await this.enqueueVariable(ticketId);
            return;
          }

          case 'escalate': {
            executedActions.push({ type: 'escalate', config });
            await this.completePipelineStage(ticketId, result, executedActions);
            await this.prisma.ticket.update({
              where: { id: ticketId },
              data: { status: 'escalated' },
            });
            await this.ticketService.autoAssign(ticketId);
            await this.prisma.pipelineProcessing.create({
              data: { ticketId, stage: 'agent', status: 'escalated' },
            });
            this.logger.log(`Ticket ${ticketId}: escalated by intent action`);
            return;
          }

          default:
            this.logger.warn(`Ticket ${ticketId}: unknown action type "${action.type}"`);
        }
      }

      // If we completed all actions without execute_agent or escalate, escalate as fallback
      if (!pipelineContinues) {
        await this.completePipelineStage(ticketId, result, executedActions);
        await this.escalateTicket(ticketId, result);
      }
    } catch (error) {
      this.logger.error(`Intent recognition failed: ${(error as Error).message}`);
      await this.prisma.pipelineProcessing.updateMany({
        where: { ticketId, stage: 'intent' },
        data: { status: 'failed', error: (error as Error).message },
      });
      throw error;
    }
  }

  private async completePipelineStage(
    ticketId: string,
    result: { intentName: string; confidence: number },
    executedActions: Array<{ type: string; config: any }>,
  ) {
    await this.prisma.pipelineProcessing.updateMany({
      where: { ticketId, stage: 'intent' },
      data: {
        status: 'completed',
        result: {
          intentName: result.intentName,
          confidence: result.confidence,
          actions: executedActions.map((a) => a.type),
        } as any,
      },
    });
  }

  private async escalateTicket(
    ticketId: string,
    result: { intentName: string; confidence: number },
  ) {
    await this.completePipelineStage(ticketId, result, [{ type: 'escalate (auto)', config: {} }]);
    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { status: 'escalated' },
    });
    await this.ticketService.autoAssign(ticketId);
    await this.prisma.pipelineProcessing.create({
      data: { ticketId, stage: 'agent', status: 'escalated' },
    });
  }

  private async enqueueVariable(ticketId: string) {
    await this.prisma.pipelineProcessing.create({
      data: { ticketId, stage: 'variable', status: 'queued' },
    });
    await this.variableQueue.add('process', { ticketId }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }
}
