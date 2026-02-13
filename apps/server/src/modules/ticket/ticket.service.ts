import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { I18nService } from '../../i18n/i18n.service';
import { EmailSendService } from '../integration/email-send.service';
import {
  parsePagination,
  paginatedResponse,
} from '../../common/helpers/pagination.helper';

@Injectable()
export class TicketService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => EmailSendService))
    private readonly emailSendService: EmailSendService,
    private readonly i18n: I18nService,
  ) {}

  async list(params: {
    page?: number;
    pageSize?: number;
    status?: string;
    source?: string;
    assignedUserId?: string;
    intentId?: string;
    startDate?: string;
    endDate?: string;
    tagIds?: string[];
  }) {
    const pagination = parsePagination(params.page, params.pageSize);
    const where: any = {};

    if (params.status) where.status = params.status;
    if (params.source) where.source = params.source;
    if (params.assignedUserId) where.assignedUserId = params.assignedUserId;
    if (params.intentId) where.intentId = params.intentId;
    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) where.createdAt.gte = new Date(params.startDate);
      if (params.endDate) where.createdAt.lte = new Date(params.endDate);
    }
    if (params.tagIds && params.tagIds.length > 0) {
      where.tags = { some: { tagId: { in: params.tagIds } } };
    }

    const [items, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        include: {
          intent: { select: { id: true, name: true } },
          assignedUser: { select: { id: true, name: true } },
          agent: { select: { id: true, name: true } },
          tags: { include: { tag: true } },
          _count: { select: { messages: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return paginatedResponse(items, total, pagination);
  }

  async getById(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        intent: true,
        assignedUser: { select: { id: true, name: true, email: true } },
        agent: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: 'asc' } },
        activities: {
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { id: true, name: true } } },
        },
        variables: {
          include: { variable: { select: { id: true, name: true } } },
        },
        safetyLogs: {
          include: { rule: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
        },
        pipelines: {
          orderBy: { createdAt: 'asc' },
        },
        tags: { include: { tag: true } },
        emailAccount: { select: { id: true, email: true, displayName: true } },
      },
    });
    if (!ticket) throw new NotFoundException(this.i18n.t('ticket.notFound'));
    return ticket;
  }

  async assign(id: string, userId: string) {
    await this.findOrThrow(id);
    const ticket = await this.prisma.ticket.update({
      where: { id },
      data: { assignedUserId: userId },
    });
    await this.addActivity(id, 'assignment', `Ticket assigned to user`, userId);
    return ticket;
  }

  async reply(id: string, content: string, userId: string) {
    const ticket = await this.getById(id);

    // Create outbound message
    await this.prisma.ticketMessage.create({
      data: {
        ticketId: id,
        direction: 'outbound',
        content,
        sender: 'agent',
      },
    });

    // Send email if ticket came from email
    if (ticket.source === 'email' && ticket.emailAccount && ticket.customerEmail) {
      const lastInbound = ticket.messages.find(
        (m) => m.direction === 'inbound' && m.messageId,
      );
      await this.emailSendService.sendReply(
        ticket.emailAccount.id,
        ticket.customerEmail,
        ticket.subject || '',
        content,
        lastInbound?.messageId || undefined,
      );
    }

    await this.prisma.ticket.update({
      where: { id },
      data: { status: 'awaiting_reply' },
    });

    await this.addActivity(id, 'reply', 'Agent sent a reply', userId);
    return { success: true };
  }

  async resolve(id: string, userId: string) {
    await this.findOrThrow(id);
    await this.prisma.ticket.update({
      where: { id },
      data: { status: 'resolved' },
    });
    await this.addActivity(id, 'status_change', 'Ticket resolved', userId);
    return { success: true };
  }

  async close(id: string, userId: string) {
    await this.findOrThrow(id);
    await this.prisma.ticket.update({
      where: { id },
      data: { status: 'closed' },
    });
    await this.addActivity(id, 'status_change', 'Ticket closed', userId);
    return { success: true };
  }

  async addTag(ticketId: string, tagId: string) {
    await this.findOrThrow(ticketId);
    // Idempotent: upsert to avoid duplicate errors
    await this.prisma.ticketTag.upsert({
      where: { ticketId_tagId: { ticketId, tagId } },
      update: {},
      create: { ticketId, tagId },
    });
    return { success: true };
  }

  async removeTag(ticketId: string, tagId: string) {
    await this.findOrThrow(ticketId);
    await this.prisma.ticketTag.deleteMany({
      where: { ticketId, tagId },
    });
    return { success: true };
  }

  async addActivity(
    ticketId: string,
    type: string,
    description: string,
    userId?: string,
  ) {
    return this.prisma.ticketActivity.create({
      data: { ticketId, type, description, userId },
    });
  }

  // Auto-assignment: round-robin
  async autoAssign(ticketId: string) {
    const agents = await this.prisma.user.findMany({
      where: { role: 'agent' },
      include: {
        _count: {
          select: {
            assignedTickets: {
              where: { status: { in: ['escalated', 'processing'] } },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (agents.length === 0) return null;

    // Find agent with fewest active tickets
    const sorted = agents.sort(
      (a, b) => a._count.assignedTickets - b._count.assignedTickets,
    );
    const selectedAgent = sorted[0];

    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { assignedUserId: selectedAgent.id },
    });

    await this.addActivity(
      ticketId,
      'assignment',
      `Auto-assigned to ${selectedAgent.name}`,
    );

    return selectedAgent;
  }

  private async findOrThrow(id: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException(this.i18n.t('ticket.notFound'));
    return ticket;
  }
}
