import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { I18nService } from '../../i18n/i18n.service';
import {
  parsePagination,
  paginatedResponse,
} from '../../common/helpers/pagination.helper';

@Injectable()
export class SafetyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  // ========== Overview ==========

  async getOverview(startDate?: Date, endDate?: Date) {
    const dateFilter: any = {};
    if (startDate) dateFilter.gte = startDate;
    if (endDate) dateFilter.lte = endDate;
    const where = startDate || endDate ? { createdAt: dateFilter } : {};

    const [totalTickets, inspectedTickets, flaggedTickets] = await Promise.all([
      this.prisma.ticket.count({ where }),
      this.prisma.safetyLog.findMany({
        where,
        select: { ticketId: true },
        distinct: ['ticketId'],
      }),
      this.prisma.safetyLog.findMany({
        where,
        select: { ticketId: true },
        distinct: ['ticketId'],
      }),
    ]);

    const inspectedCount = inspectedTickets.length;
    const flaggedCount = flaggedTickets.length;
    const problemRate =
      inspectedCount > 0 ? (flaggedCount / inspectedCount) * 100 : 0;

    // Daily trend
    const logs = await this.prisma.safetyLog.findMany({
      where,
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const dailyTrend: Record<string, number> = {};
    for (const log of logs) {
      const day = log.createdAt.toISOString().split('T')[0];
      dailyTrend[day] = (dailyTrend[day] || 0) + 1;
    }

    return {
      totalTickets,
      inspectedTickets: inspectedCount,
      flaggedTickets: flaggedCount,
      problemRate: Math.round(problemRate * 100) / 100,
      dailyTrend: Object.entries(dailyTrend).map(([date, count]) => ({
        date,
        count,
      })),
    };
  }

  // ========== Rules ==========

  async listRules() {
    return this.prisma.safetyRule.findMany({
      orderBy: [{ type: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async createRule(data: {
    name: string;
    description?: string;
    checkType: string;
    pattern?: string;
    severity?: string;
    action?: string;
  }) {
    return this.prisma.safetyRule.create({
      data: {
        ...data,
        type: 'custom',
        severity: data.severity || 'medium',
        action: data.action || 'flag',
      },
    });
  }

  async updateRule(id: string, data: any) {
    const rule = await this.findRuleOrThrow(id);
    if (rule.type === 'builtin') {
      // Only allow enabling/disabling and severity changes for built-in rules
      return this.prisma.safetyRule.update({
        where: { id },
        data: { enabled: data.enabled, severity: data.severity },
      });
    }
    return this.prisma.safetyRule.update({ where: { id }, data });
  }

  async deleteRule(id: string) {
    const rule = await this.findRuleOrThrow(id);
    if (rule.type === 'builtin') {
      throw new BadRequestException(this.i18n.t('safety.cannotDeleteBuiltin'));
    }
    return this.prisma.safetyRule.delete({ where: { id } });
  }

  async toggleRule(id: string) {
    const rule = await this.findRuleOrThrow(id);
    return this.prisma.safetyRule.update({
      where: { id },
      data: { enabled: !rule.enabled },
    });
  }

  // ========== Logs ==========

  async listLogs(page?: number, pageSize?: number, ticketId?: string) {
    const pagination = parsePagination(page, pageSize);
    const where: any = {};
    if (ticketId) where.ticketId = ticketId;

    const [items, total] = await Promise.all([
      this.prisma.safetyLog.findMany({
        where,
        include: {
          rule: { select: { name: true, type: true } },
          ticket: { select: { id: true, subject: true, customerEmail: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.safetyLog.count({ where }),
    ]);

    return paginatedResponse(items, total, pagination);
  }

  // ========== Alert Config ==========

  async getAlertConfig() {
    const config = await this.prisma.alertConfig.findFirst();
    return (
      config || {
        severityLevels: ['high', 'critical'],
        channels: ['in_app'],
        threshold: 10,
        periodMinutes: 60,
        enabled: true,
      }
    );
  }

  async updateAlertConfig(data: any) {
    const existing = await this.prisma.alertConfig.findFirst();
    if (existing) {
      return this.prisma.alertConfig.update({
        where: { id: existing.id },
        data,
      });
    }
    return this.prisma.alertConfig.create({ data });
  }

  private async findRuleOrThrow(id: string) {
    const rule = await this.prisma.safetyRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException(this.i18n.t('safety.ruleNotFound'));
    return rule;
  }
}
