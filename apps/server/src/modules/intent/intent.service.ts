import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class IntentService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.intent.findMany({
      include: {
        boundAgent: { select: { id: true, name: true, type: true } },
        actions: { orderBy: { order: 'asc' } },
      },
      orderBy: [{ type: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async create(data: {
    name: string;
    description?: string;
    exampleUtterances?: string[];
    keywords?: string[];
    actions?: Array<{ type: string; config?: any; order?: number }>;
  }) {
    return this.prisma.intent.create({
      data: {
        name: data.name,
        description: data.description,
        type: 'custom',
        exampleUtterances: data.exampleUtterances || [],
        keywords: data.keywords || [],
        actions: data.actions
          ? {
              create: data.actions.map((a, i) => ({
                type: a.type,
                config: a.config || {},
                order: a.order ?? i + 1,
              })),
            }
          : undefined,
      },
      include: { actions: { orderBy: { order: 'asc' } } },
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      exampleUtterances?: string[];
      keywords?: string[];
      actions?: Array<{ type: string; config?: any; order?: number }>;
    },
  ) {
    const intent = await this.findOrThrow(id);

    // Handle actions update (delete-and-recreate)
    if (data.actions !== undefined) {
      await this.prisma.intentAction.deleteMany({ where: { intentId: id } });
      if (data.actions.length > 0) {
        await this.prisma.intentAction.createMany({
          data: data.actions.map((a, i) => ({
            intentId: id,
            type: a.type,
            config: a.config || {},
            order: a.order ?? i + 1,
          })),
        });
      }
    }

    const { actions: _actions, ...intentData } = data;

    if (intent.type === 'preset') {
      // Only allow updating description, examples, keywords for preset
      return this.prisma.intent.update({
        where: { id },
        data: {
          description: intentData.description,
          exampleUtterances: intentData.exampleUtterances as any,
          keywords: intentData.keywords as any,
        },
        include: { actions: { orderBy: { order: 'asc' } } },
      });
    }
    return this.prisma.intent.update({
      where: { id },
      data: intentData as any,
      include: { actions: { orderBy: { order: 'asc' } } },
    });
  }

  async delete(id: string) {
    const intent = await this.findOrThrow(id);
    if (intent.type === 'preset') {
      throw new BadRequestException('Cannot delete preset intents');
    }
    return this.prisma.intent.delete({ where: { id } });
  }

  async toggle(id: string) {
    const intent = await this.findOrThrow(id);
    return this.prisma.intent.update({
      where: { id },
      data: { enabled: !intent.enabled },
    });
  }

  async bindAgent(id: string, agentId: string | null) {
    await this.findOrThrow(id);
    return this.prisma.intent.update({
      where: { id },
      data: { boundAgentId: agentId },
    });
  }

  async getEnabledIntents() {
    return this.prisma.intent.findMany({
      where: { enabled: true },
      include: {
        boundAgent: true,
        actions: { orderBy: { order: 'asc' } },
      },
    });
  }

  private async findOrThrow(id: string) {
    const intent = await this.prisma.intent.findUnique({ where: { id } });
    if (!intent) throw new NotFoundException('Intent not found');
    return intent;
  }
}
