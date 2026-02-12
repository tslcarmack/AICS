import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IntegrationService } from './integration.service';
import { I18nService } from '../../i18n/i18n.service';
import {
  CreateEmailAccountDto,
  UpdateEmailAccountDto,
  IngestMessageDto,
  ManualMessageDto,
  SimulateEmailDto,
} from './dto/integration.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { PipelineService } from '../pipeline/pipeline.service';

@Controller()
@UseGuards(AuthGuard('jwt'))
export class IntegrationController {
  private readonly logger = new Logger(IntegrationController.name);

  constructor(
    private readonly integrationService: IntegrationService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => PipelineService))
    private readonly pipelineService: PipelineService,
    private readonly i18n: I18nService,
  ) {}

  // ========== Email Accounts ==========

  @Post('email-accounts')
  createEmailAccount(@Body() dto: CreateEmailAccountDto) {
    return this.integrationService.createEmailAccount(dto);
  }

  @Get('email-accounts')
  listEmailAccounts() {
    return this.integrationService.listEmailAccounts();
  }

  @Put('email-accounts/:id')
  updateEmailAccount(@Param('id') id: string, @Body() dto: UpdateEmailAccountDto) {
    return this.integrationService.updateEmailAccount(id, dto);
  }

  @Delete('email-accounts/:id')
  deleteEmailAccount(@Param('id') id: string) {
    return this.integrationService.deleteEmailAccount(id);
  }

  @Post('email-accounts/:id/toggle')
  toggleEmailAccount(@Param('id') id: string) {
    return this.integrationService.toggleEmailAccount(id);
  }

  @Post('email-accounts/:id/test')
  testEmailAccount(@Param('id') id: string) {
    return this.integrationService.testEmailAccount(id);
  }

  // ========== External Ingestion ==========

  @Post('integration/ingest')
  async ingestMessage(@Body() dto: IngestMessageDto) {
    const ticket = await this.prisma.ticket.create({
      data: {
        source: 'api',
        customerEmail: dto.sender,
        customerName: dto.senderName,
        subject: dto.subject,
        status: 'pending',
        metadata: dto.metadata as any,
        messages: {
          create: {
            direction: 'inbound',
            content: dto.body,
            sender: dto.sender,
          },
        },
      },
      include: { messages: true },
    });

    // Auto-enqueue into pipeline for AI processing
    try {
      await this.pipelineService.enqueueTicket(ticket.id);
      this.logger.log(`API ingest ticket enqueued: ${ticket.id}`);
    } catch (err) {
      this.logger.error(`Failed to enqueue ticket ${ticket.id}: ${(err as Error).message}`);
    }

    return { ticketId: ticket.id };
  }

  // ========== Manual Message ==========

  @Post('integration/manual')
  async manualMessage(@Body() dto: ManualMessageDto) {
    const ticket = await this.prisma.ticket.create({
      data: {
        source: 'manual',
        customerEmail: dto.customerEmail,
        customerName: dto.customerName,
        subject: dto.subject,
        status: 'pending',
        messages: {
          create: {
            direction: 'inbound',
            content: dto.body,
            sender: dto.customerEmail,
          },
        },
      },
      include: { messages: true },
    });

    // Auto-enqueue into pipeline for AI processing
    try {
      await this.pipelineService.enqueueTicket(ticket.id);
      this.logger.log(`Manual message ticket enqueued: ${ticket.id}`);
    } catch (err) {
      this.logger.error(`Failed to enqueue ticket ${ticket.id}: ${(err as Error).message}`);
    }

    return { ticketId: ticket.id };
  }

  // ========== Simulate Email (for testing) ==========

  @Post('integration/simulate-email')
  async simulateEmail(@Body() dto: SimulateEmailDto) {
    // Find first enabled email account to associate with (optional)
    const enabledAccounts = await this.integrationService.getEnabledAccounts();
    const emailAccountId = enabledAccounts.length > 0 ? enabledAccounts[0].id : undefined;

    const ticket = await this.prisma.ticket.create({
      data: {
        source: 'email',
        customerEmail: dto.senderEmail,
        customerName: dto.senderName,
        subject: dto.subject || this.i18n.t('integration.simulatedEmailSubject'),
        status: 'pending',
        emailAccountId: emailAccountId || undefined,
        messages: {
          create: {
            direction: 'inbound',
            content: dto.body,
            sender: dto.senderEmail,
          },
        },
      },
      include: { messages: true },
    });

    // Auto-enqueue into pipeline for AI processing (same as real email flow)
    try {
      await this.pipelineService.enqueueTicket(ticket.id);
      this.logger.log(`Simulated email ticket enqueued: ${ticket.id}`);
    } catch (err) {
      this.logger.error(`Failed to enqueue simulated ticket ${ticket.id}: ${(err as Error).message}`);
    }

    return { ticketId: ticket.id };
  }
}
