import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TagService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.tag.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: { name: string; color?: string }) {
    const existing = await this.prisma.tag.findUnique({
      where: { name: data.name },
    });
    if (existing) {
      throw new BadRequestException(`Tag "${data.name}" already exists`);
    }
    return this.prisma.tag.create({
      data: {
        name: data.name,
        color: data.color || '#6b7280',
      },
    });
  }

  async update(id: string, data: { name?: string; color?: string }) {
    await this.findOrThrow(id);
    if (data.name) {
      const existing = await this.prisma.tag.findFirst({
        where: { name: data.name, NOT: { id } },
      });
      if (existing) {
        throw new BadRequestException(`Tag "${data.name}" already exists`);
      }
    }
    return this.prisma.tag.update({ where: { id }, data });
  }

  async delete(id: string) {
    await this.findOrThrow(id);
    return this.prisma.tag.delete({ where: { id } });
  }

  private async findOrThrow(id: string) {
    const tag = await this.prisma.tag.findUnique({ where: { id } });
    if (!tag) throw new NotFoundException('Tag not found');
    return tag;
  }
}
