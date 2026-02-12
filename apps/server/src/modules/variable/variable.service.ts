import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class VariableService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter?: { isSystem?: boolean }) {
    const where: any = {};
    if (filter?.isSystem !== undefined) {
      where.isSystem = filter.isSystem;
    }
    return this.prisma.variable.findMany({
      where,
      include: { listItems: true },
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(data: {
    name: string;
    type: string;
    smartExtractionEnabled?: boolean;
    extractionInstruction?: string;
    keywords?: string[];
    listItems?: Array<{ value: string; keywords?: string[]; description?: string }>;
  }) {
    return this.prisma.variable.create({
      data: {
        name: data.name,
        type: data.type,
        isSystem: false,
        smartExtractionEnabled: data.smartExtractionEnabled || false,
        extractionInstruction: data.extractionInstruction,
        keywords: data.keywords as any,
        listItems: data.listItems
          ? {
              create: data.listItems.map((item) => ({
                value: item.value,
                keywords: item.keywords as any,
                description: item.description,
              })),
            }
          : undefined,
      },
      include: { listItems: true },
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      type?: string;
      smartExtractionEnabled?: boolean;
      extractionInstruction?: string;
      keywords?: string[];
    },
  ) {
    const variable = await this.findOrThrow(id);
    if (variable.isSystem) {
      // System variables: only allow toggling smartExtraction for specific ones
      return this.prisma.variable.update({
        where: { id },
        data: {
          smartExtractionEnabled: data.smartExtractionEnabled,
          extractionInstruction: data.extractionInstruction,
        },
        include: { listItems: true },
      });
    }
    return this.prisma.variable.update({
      where: { id },
      data: data as any,
      include: { listItems: true },
    });
  }

  async delete(id: string) {
    const variable = await this.findOrThrow(id);
    if (variable.isSystem) {
      throw new BadRequestException('Cannot delete system variables');
    }
    return this.prisma.variable.delete({ where: { id } });
  }

  async toggleSmartExtraction(id: string) {
    const variable = await this.findOrThrow(id);
    return this.prisma.variable.update({
      where: { id },
      data: { smartExtractionEnabled: !variable.smartExtractionEnabled },
    });
  }

  async getAllVariables() {
    return this.prisma.variable.findMany({
      include: { listItems: true },
    });
  }

  private async findOrThrow(id: string) {
    const variable = await this.prisma.variable.findUnique({ where: { id } });
    if (!variable) throw new NotFoundException('Variable not found');
    return variable;
  }
}
