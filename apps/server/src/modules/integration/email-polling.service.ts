import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { IntegrationService } from './integration.service';
import { PipelineService } from '../pipeline/pipeline.service';

@Injectable()
export class EmailPollingService {
  private readonly logger = new Logger(EmailPollingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrationService: IntegrationService,
    @Inject(forwardRef(() => PipelineService))
    private readonly pipelineService: PipelineService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async pollEmails() {
    const accounts = await this.integrationService.getEnabledAccounts();
    for (const account of accounts) {
      try {
        await this.pollAccount(account);
      } catch (error) {
        this.logger.error(
          `Failed to poll ${account.email}: ${(error as Error).message}`,
        );
      }
    }
  }

  /**
   * Detect if a provider requires IMAP ID command (163, QQ, 126, yeah.net, etc.)
   */
  private needsImapId(host: string): boolean {
    const hosts = ['163.com', 'qq.com', '126.com', 'yeah.net', 'sina.com'];
    return hosts.some((h) => host.includes(h));
  }

  /**
   * Send IMAP ID command for providers that require it (RFC 2971)
   */
  private async sendImapId(connection: any): Promise<void> {
    return new Promise<void>((resolve) => {
      const imap = connection.imap || connection;
      if (typeof imap._enqueue === 'function') {
        imap._enqueue(
          'ID ("name" "AICS" "version" "1.0.0" "vendor" "aics-client" "support-email" "support@aics.local")',
          () => resolve(),
        );
      } else {
        resolve();
      }
    });
  }

  private async pollAccount(account: {
    id: string;
    email: string;
    imapHost: string;
    imapPort: number;
    credentials: unknown;
  }) {
    this.logger.debug(`Polling ${account.email}...`);

    // IMAP connection and email fetching implementation
    // Using imap-simple library to connect and fetch unread emails
    try {
      const imapSimple = await import('imap-simple');
      const config = {
        imap: {
          user: account.email,
          password: (account.credentials as any)?.password || '',
          host: account.imapHost,
          port: account.imapPort,
          tls: true,
          authTimeout: 10000,
          tlsOptions: { rejectUnauthorized: false },
        },
      };

      const connection = await imapSimple.connect(config);

      // Send IMAP ID for providers that require it (163, QQ, etc.)
      if (this.needsImapId(account.imapHost)) {
        await this.sendImapId(connection);
      }

      await connection.openBox('INBOX');

      const searchCriteria = ['UNSEEN'];
      const fetchOptions = {
        bodies: ['HEADER', 'TEXT', ''],
        markSeen: true,
        struct: true,
      };

      const messages = await connection.search(searchCriteria, fetchOptions);

      for (const msg of messages) {
        try {
          await this.processEmail(account.id, msg);
        } catch (err) {
          this.logger.error(`Error processing email: ${(err as Error).message}`);
        }
      }

      // Update last sync time
      await this.prisma.emailAccount.update({
        where: { id: account.id },
        data: { lastSyncAt: new Date() },
      });

      connection.end();
      this.logger.debug(
        `Polled ${account.email}: ${messages.length} new messages`,
      );
    } catch (error) {
      this.logger.error(
        `IMAP connection failed for ${account.email}: ${(error as Error).message}`,
      );
    }
  }

  private async processEmail(emailAccountId: string, msg: any) {
    const { simpleParser } = await import('mailparser');

    const rawEmail =
      msg.parts?.find((p: any) => p.which === '')?.body || '';
    const parsed = await simpleParser(rawEmail);

    const messageId = parsed.messageId || '';
    const subject = parsed.subject || '(No Subject)';
    const from = parsed.from?.value?.[0];
    const senderEmail = from?.address || '';
    const senderName = from?.name || '';
    const textContent = parsed.text || parsed.html || '';

    // Duplicate detection
    if (messageId) {
      const existing = await this.prisma.ticket.findUnique({
        where: { emailMessageId: messageId },
      });
      if (existing) {
        this.logger.debug(`Skipping duplicate email: ${messageId}`);
        return;
      }
    }

    // Check for follow-up (In-Reply-To)
    const inReplyTo = parsed.inReplyTo;
    if (inReplyTo) {
      const parentTicket = await this.prisma.ticket.findFirst({
        where: {
          messages: { some: { messageId: inReplyTo } },
        },
      });

      if (parentTicket) {
        // Append to existing ticket
        await this.prisma.ticketMessage.create({
          data: {
            ticketId: parentTicket.id,
            direction: 'inbound',
            content: textContent,
            sender: senderEmail,
            messageId,
          },
        });

        // Reopen if resolved/closed and re-enqueue into pipeline
        if (['resolved', 'closed'].includes(parentTicket.status)) {
          await this.prisma.ticket.update({
            where: { id: parentTicket.id },
            data: { status: 'pending' },
          });
        }

        // Re-enqueue follow-up into pipeline for AI processing
        if (['pending', 'resolved', 'closed'].includes(parentTicket.status)) {
          try {
            await this.pipelineService.enqueueTicket(parentTicket.id);
            this.logger.log(`Follow-up email enqueued for pipeline: ticket ${parentTicket.id}`);
          } catch (err) {
            this.logger.error(`Failed to enqueue follow-up: ${(err as Error).message}`);
          }
        }

        return;
      }
    }

    // Create new ticket
    const ticket = await this.prisma.ticket.create({
      data: {
        source: 'email',
        customerEmail: senderEmail,
        customerName: senderName,
        subject,
        status: 'pending',
        emailAccountId,
        emailMessageId: messageId || undefined,
        messages: {
          create: {
            direction: 'inbound',
            content: textContent,
            sender: senderEmail,
            messageId: messageId || undefined,
          },
        },
      },
    });

    // Auto-enqueue new ticket into pipeline for AI processing
    try {
      await this.pipelineService.enqueueTicket(ticket.id);
      this.logger.log(`New email ticket enqueued for pipeline: ${ticket.id}`);
    } catch (err) {
      this.logger.error(`Failed to enqueue ticket ${ticket.id}: ${(err as Error).message}`);
    }
  }
}
