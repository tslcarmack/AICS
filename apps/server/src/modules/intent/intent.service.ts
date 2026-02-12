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
      },
      orderBy: [{ type: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async create(data: {
    name: string;
    description?: string;
    exampleUtterances?: string[];
    keywords?: string[];
  }) {
    return this.prisma.intent.create({
      data: {
        name: data.name,
        description: data.description,
        type: 'custom',
        exampleUtterances: data.exampleUtterances || [],
        keywords: data.keywords || [],
      },
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      exampleUtterances?: string[];
      keywords?: string[];
    },
  ) {
    const intent = await this.findOrThrow(id);
    if (intent.type === 'preset') {
      // Only allow updating description and examples for preset
      return this.prisma.intent.update({
        where: { id },
        data: {
          description: data.description,
          exampleUtterances: data.exampleUtterances as any,
          keywords: data.keywords as any,
        },
      });
    }
    return this.prisma.intent.update({ where: { id }, data: data as any });
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
      include: { boundAgent: true },
    });
  }

  private async findOrThrow(id: string) {
    const intent = await this.prisma.intent.findUnique({ where: { id } });
    if (!intent) throw new NotFoundException('Intent not found');
    return intent;
  }
}
