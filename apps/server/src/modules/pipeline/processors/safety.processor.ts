import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { SafetyCheckService } from '../../safety/safety-check.service';
import { EmailSendService } from '../../integration/email-send.service';
import { SettingsService } from '../../settings/settings.service';
import { TicketService } from '../../ticket/ticket.service';

@Processor('pipeline-safety')
export class SafetyProcessor extends WorkerHost {
  private readonly logger = new Logger(SafetyProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly safetyCheckService: SafetyCheckService,
    private readonly emailSendService: EmailSendService,
    private readonly settingsService: SettingsService,
    private readonly ticketService: TicketService,
  ) {
    super();
  }

  async process(job: Job<{ ticketId: string; reply: string }>) {
    const { ticketId, reply } = job.data;
    this.logger.log(`Safety check for ticket: ${ticketId}`);

    try {
      const ticket = await this.prisma.ticket.findUnique({
        where: { id: ticketId },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          emailAccount: true,
        },
      });

      if (!ticket) throw new Error('Ticket not found');

      const customerMessage =
        ticket.messages.filter((m) => m.direction === 'inbound').pop()?.content || '';
      const outboundHistory = ticket.messages
        .filter((m) => m.direction === 'outbound')
        .map((m) => m.content);

      // Run safety checks
      const result = await this.safetyCheckService.checkReply(
        ticketId,
        reply,
        customerMessage,
        outboundHistory,
      );

      const autoReplyEnabled = await this.settingsService.get(
        'auto_reply_enabled',
        true,
      );

      if (result.passed && autoReplyEnabled) {
        // ✅ Safe — auto-reply
        // Store outbound message
        await this.prisma.ticketMessage.create({
          data: {
            ticketId,
            direction: 'outbound',
            content: reply,
            sender: 'ai',
          },
        });

        // Send email if applicable
        if (
          ticket.source === 'email' &&
          ticket.emailAccount &&
          ticket.customerEmail
        ) {
          const lastInbound = ticket.messages.find(
            (m) => m.direction === 'inbound' && m.messageId,
          );
          await this.emailSendService.sendReply(
            ticket.emailAccount.id,
            ticket.customerEmail,
            ticket.subject || '',
            reply,
            lastInbound?.messageId || undefined,
          );
        }

        await this.prisma.ticket.update({
          where: { id: ticketId },
          data: { status: 'awaiting_reply' },
        });

        await this.prisma.pipelineProcessing.updateMany({
          where: { ticketId, stage: 'safety' },
          data: {
            status: 'completed',
            result: { passed: true, autoReplied: true } as any,
          },
        });

        await this.prisma.ticketActivity.create({
          data: {
            ticketId,
            type: 'pipeline_stage',
            description: 'Safety check passed — auto-reply sent',
          },
        });
      } else {
        // ❌ Unsafe or auto-reply disabled — escalate
        await this.prisma.ticket.update({
          where: { id: ticketId },
          data: { status: 'escalated' },
        });

        await this.ticketService.autoAssign(ticketId);

        const violationSummary = result.violations
          .map((v) => `${v.ruleName}: ${v.details}`)
          .join('; ');

        await this.prisma.pipelineProcessing.updateMany({
          where: { ticketId, stage: 'safety' },
          data: {
            status: 'escalated',
            result: {
              passed: false,
              violations: result.violations.length,
              draftReply: reply,
            } as any,
          },
        });

        await this.prisma.ticketActivity.create({
          data: {
            ticketId,
            type: 'pipeline_stage',
            description: result.passed
              ? 'Safety check passed but auto-reply disabled — escalated for review'
              : `Safety check failed: ${violationSummary} — escalated to manual`,
          },
        });
      }
    } catch (error) {
      this.logger.error(`Safety check failed: ${(error as Error).message}`);
      await this.prisma.pipelineProcessing.updateMany({
        where: { ticketId, stage: 'safety' },
        data: { status: 'failed', error: (error as Error).message },
      });
      throw error;
    }
  }
}
