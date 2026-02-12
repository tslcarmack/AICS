import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { AgentExecutionService } from '../../agent/agent-execution.service';
import { TicketService } from '../../ticket/ticket.service';

@Processor('pipeline-agent')
export class AgentProcessor extends WorkerHost {
  private readonly logger = new Logger(AgentProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentExecutionService: AgentExecutionService,
    private readonly ticketService: TicketService,
    @InjectQueue('pipeline-safety') private readonly safetyQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<{ ticketId: string }>) {
    const { ticketId } = job.data;
    this.logger.log(`Agent processing ticket: ${ticketId}`);

    try {
      const ticket = await this.prisma.ticket.findUnique({
        where: { id: ticketId },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          variables: { include: { variable: true } },
        },
      });

      if (!ticket) throw new Error('Ticket not found');

      if (!ticket.agentId) {
        // No agent bound, escalate
        await this.prisma.ticket.update({
          where: { id: ticketId },
          data: { status: 'escalated' },
        });
        await this.ticketService.autoAssign(ticketId);
        await this.prisma.pipelineProcessing.updateMany({
          where: { ticketId, stage: 'agent' },
          data: { status: 'escalated' },
        });
        return;
      }

      // Build variables map
      const variables: Record<string, string | null> = {};
      for (const tv of ticket.variables) {
        variables[tv.variable.name] = tv.value;
      }

      // Get latest customer message
      const customerMessages = ticket.messages.filter(
        (m) => m.direction === 'inbound',
      );
      const latestMessage = customerMessages[customerMessages.length - 1];
      if (!latestMessage) throw new Error('No customer message');

      // Build conversation history
      const history = ticket.messages.map((m) => ({
        role: m.direction === 'inbound' ? 'user' : 'assistant',
        content: m.content,
      }));

      // Execute agent
      const result = await this.agentExecutionService.execute(ticket.agentId, {
        ticketId,
        customerMessage: latestMessage.content,
        conversationHistory: history.slice(0, -1), // exclude current message
        variables,
        metadata: ticket.metadata as Record<string, unknown>,
      });

      // Store the generated reply as draft (not sent yet)
      await this.prisma.pipelineProcessing.updateMany({
        where: { ticketId, stage: 'agent' },
        data: {
          status: 'completed',
          result: {
            reply: result.reply,
            agentName: result.agentName,
          } as any,
        },
      });

      await this.prisma.ticketActivity.create({
        data: {
          ticketId,
          type: 'pipeline_stage',
          description: `Agent "${result.agentName}" generated reply`,
        },
      });

      // Enqueue to safety check
      await this.prisma.pipelineProcessing.create({
        data: { ticketId, stage: 'safety', status: 'queued' },
      });

      await this.safetyQueue.add(
        'process',
        { ticketId, reply: result.reply },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        },
      );
    } catch (error) {
      this.logger.error(`Agent processing failed: ${(error as Error).message}`);
      await this.prisma.pipelineProcessing.updateMany({
        where: { ticketId, stage: 'agent' },
        data: { status: 'failed', error: (error as Error).message },
      });
      throw error;
    }
  }
}
