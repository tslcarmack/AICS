import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { encrypt, decrypt, maskSecret } from './crypto.util';

@Injectable()
export class ToolService {
  private readonly logger = new Logger(ToolService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── List ─────────────────────────────────────────────────────────

  async findAll() {
    const tools = await this.prisma.tool.findMany({
      include: {
        _count: { select: { agents: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return tools.map((t) => ({
      ...t,
      authConfig: this.maskAuthConfig(t.authConfig),
      agentCount: t._count.agents,
      _count: undefined,
    }));
  }

  // ── Get By ID ────────────────────────────────────────────────────

  async findById(id: string) {
    const tool = await this.prisma.tool.findUnique({
      where: { id },
      include: {
        agents: {
          include: { agent: { select: { id: true, name: true } } },
        },
        _count: { select: { executionLogs: true } },
      },
    });
    if (!tool) throw new NotFoundException('Tool not found');
    return {
      ...tool,
      authConfig: this.maskAuthConfig(tool.authConfig),
      boundAgents: tool.agents.map((a) => a.agent),
      agents: undefined,
      executionLogCount: tool._count.executionLogs,
      _count: undefined,
    };
  }

  // ── Get raw tool (with decrypted auth for execution) ─────────────

  async findByIdRaw(id: string) {
    const tool = await this.prisma.tool.findUnique({ where: { id } });
    if (!tool) throw new NotFoundException('Tool not found');
    return {
      ...tool,
      authConfig: this.decryptAuthConfig(tool.authConfig),
    };
  }

  // ── Create ───────────────────────────────────────────────────────

  async create(data: {
    name: string;
    displayName: string;
    description: string;
    type: string;
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    bodyTemplate?: unknown;
    authType?: string;
    authConfig?: Record<string, string>;
    parameters: Record<string, unknown>;
    responseMapping?: Record<string, string>;
    timeout?: number;
  }) {
    // Validate unique name
    const existing = await this.prisma.tool.findUnique({
      where: { name: data.name },
    });
    if (existing) {
      throw new BadRequestException(
        `Tool name "${data.name}" is already in use`,
      );
    }

    return this.prisma.tool.create({
      data: {
        name: data.name,
        displayName: data.displayName,
        description: data.description,
        type: data.type,
        method: data.method,
        url: data.url,
        headers: data.headers as any,
        bodyTemplate: data.bodyTemplate as any,
        authType: data.authType || 'none',
        authConfig: this.encryptAuthConfig(data.authConfig),
        parameters: data.parameters as any,
        responseMapping: data.responseMapping as any,
        timeout: data.timeout || 30000,
      },
    });
  }

  // ── Update ───────────────────────────────────────────────────────

  async update(
    id: string,
    data: {
      name?: string;
      displayName?: string;
      description?: string;
      type?: string;
      method?: string;
      url?: string;
      headers?: Record<string, string>;
      bodyTemplate?: unknown;
      authType?: string;
      authConfig?: Record<string, string>;
      parameters?: Record<string, unknown>;
      responseMapping?: Record<string, string>;
      timeout?: number;
    },
  ) {
    await this.findOrThrow(id);

    // If name is changing, check uniqueness
    if (data.name) {
      const existing = await this.prisma.tool.findFirst({
        where: { name: data.name, NOT: { id } },
      });
      if (existing) {
        throw new BadRequestException(
          `Tool name "${data.name}" is already in use`,
        );
      }
    }

    const updateData: any = { ...data };

    // Encrypt auth config if provided
    if (data.authConfig) {
      updateData.authConfig = this.encryptAuthConfig(data.authConfig);
    }

    return this.prisma.tool.update({
      where: { id },
      data: updateData,
    });
  }

  // ── Delete ───────────────────────────────────────────────────────

  async delete(id: string) {
    const tool = await this.prisma.tool.findUnique({
      where: { id },
      include: { _count: { select: { agents: true } } },
    });
    if (!tool) throw new NotFoundException('Tool not found');

    // AgentTool records are cascade deleted
    return this.prisma.tool.delete({ where: { id } });
  }

  // ── Toggle ───────────────────────────────────────────────────────

  async toggle(id: string) {
    const tool = await this.findOrThrow(id);
    return this.prisma.tool.update({
      where: { id },
      data: { enabled: !tool.enabled },
    });
  }

  // ── Get agent count (for delete warning) ─────────────────────────

  async getAgentCount(id: string): Promise<number> {
    const result = await this.prisma.agentTool.count({
      where: { toolId: id },
    });
    return result;
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private async findOrThrow(id: string) {
    const tool = await this.prisma.tool.findUnique({ where: { id } });
    if (!tool) throw new NotFoundException('Tool not found');
    return tool;
  }

  private encryptAuthConfig(
    config?: Record<string, string> | null,
  ): any {
    if (!config || Object.keys(config).length === 0) return null;
    try {
      const encrypted: Record<string, string> = {};
      for (const [key, value] of Object.entries(config)) {
        encrypted[key] = value ? encrypt(value) : '';
      }
      return encrypted;
    } catch (error) {
      this.logger.error('Failed to encrypt auth config', (error as Error).message);
      throw new BadRequestException(
        'Failed to encrypt authentication credentials. Check TOOL_AUTH_ENCRYPTION_KEY configuration.',
      );
    }
  }

  private decryptAuthConfig(config: any): Record<string, string> | null {
    if (!config || typeof config !== 'object') return null;
    try {
      const decrypted: Record<string, string> = {};
      for (const [key, value] of Object.entries(config as Record<string, string>)) {
        decrypted[key] = value ? decrypt(value) : '';
      }
      return decrypted;
    } catch (error) {
      this.logger.error('Failed to decrypt auth config', (error as Error).message);
      return null;
    }
  }

  private maskAuthConfig(config: any): Record<string, string> | null {
    if (!config || typeof config !== 'object') return null;
    try {
      const masked: Record<string, string> = {};
      for (const [key, value] of Object.entries(config as Record<string, string>)) {
        // Decrypt then mask
        const decrypted = value ? decrypt(value) : '';
        masked[key] = maskSecret(decrypted);
      }
      return masked;
    } catch {
      // If decryption fails, return masked placeholder
      const masked: Record<string, string> = {};
      for (const key of Object.keys(config as Record<string, string>)) {
        masked[key] = '****';
      }
      return masked;
    }
  }
}
