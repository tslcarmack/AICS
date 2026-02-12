import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const [
      totalTickets,
      openTickets,
      resolvedToday,
      autoRepliedToday,
    ] = await Promise.all([
      this.prisma.ticket.count(),
      this.prisma.ticket.count({
        where: { status: { in: ['pending', 'processing', 'escalated'] } },
      }),
      this.prisma.ticket.count({
        where: {
          status: 'resolved',
          updatedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      this.prisma.pipelineProcessing.count({
        where: {
          stage: 'safety',
          status: 'completed',
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
    ]);

    const totalToday = await this.prisma.ticket.count({
      where: {
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    });

    const autoReplyRate =
      totalToday > 0 ? (autoRepliedToday / totalToday) * 100 : 0;

    return {
      totalTickets,
      openTickets,
      resolvedToday,
      autoReplyRate: Math.round(autoReplyRate * 100) / 100,
    };
  }

  async getVolume(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const tickets = await this.prisma.ticket.findMany({
      where: { createdAt: { gte: startDate } },
      select: { createdAt: true },
    });

    const dailyVolume: Record<string, number> = {};
    for (const ticket of tickets) {
      const day = ticket.createdAt.toISOString().split('T')[0];
      dailyVolume[day] = (dailyVolume[day] || 0) + 1;
    }

    return Object.entries(dailyVolume)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getIntentDistribution() {
    const tickets = await this.prisma.ticket.groupBy({
      by: ['intentId'],
      _count: true,
      where: { intentId: { not: null } },
    });

    const intents = await this.prisma.intent.findMany({
      where: { id: { in: tickets.map((t) => t.intentId!).filter(Boolean) } },
      select: { id: true, name: true },
    });

    const intentMap = new Map(intents.map((i) => [i.id, i.name]));

    return tickets.map((t) => ({
      intentId: t.intentId,
      intentName: intentMap.get(t.intentId!) || 'Unknown',
      count: t._count,
    }));
  }

  async getPipelineStats() {
    const [completed, failed, escalated] = await Promise.all([
      this.prisma.pipelineProcessing.count({
        where: { stage: 'safety', status: 'completed' },
      }),
      this.prisma.pipelineProcessing.count({
        where: { status: 'failed' },
      }),
      this.prisma.pipelineProcessing.count({
        where: { status: 'escalated' },
      }),
    ]);

    const total = completed + failed + escalated;

    return {
      total,
      completed,
      failed,
      escalated,
      successRate: total > 0 ? Math.round((completed / total) * 100 * 100) / 100 : 0,
    };
  }
}
