import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAll(): Promise<Record<string, unknown>> {
    const settings = await this.prisma.systemSetting.findMany();
    const result: Record<string, unknown> = {};
    for (const s of settings) {
      result[s.key] = s.value;
    }
    return result;
  }

  async get<T = unknown>(key: string, defaultValue?: T): Promise<T> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key },
    });
    return (setting?.value as T) ?? (defaultValue as T);
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.prisma.systemSetting.upsert({
      where: { key },
      update: { value: value as any },
      create: { key, value: value as any },
    });
  }

  async updateMany(settings: Record<string, unknown>): Promise<void> {
    const ops = Object.entries(settings).map(([key, value]) =>
      this.prisma.systemSetting.upsert({
        where: { key },
        update: { value: value as any },
        create: { key, value: value as any },
      }),
    );
    await this.prisma.$transaction(ops);
  }
}
