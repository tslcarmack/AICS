import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AgentService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const agents = await this.prisma.agent.findMany({
      include: {
        _count: { select: { intents: true } },
        knowledgeBases: {
          include: {
            knowledgeBase: { select: { id: true, name: true } },
          },
        },
        tools: {
          include: {
            tool: { select: { id: true, name: true, displayName: true, enabled: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return agents.map((a) => ({
      ...a,
      intentCount: a._count.intents,
      knowledgeBases: a.knowledgeBases.map((kb) => kb.knowledgeBase),
      tools: a.tools.map((t) => t.tool),
      _count: undefined,
    }));
  }

  async getById(id: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id },
      include: {
        knowledgeBases: {
          include: { knowledgeBase: { select: { id: true, name: true } } },
        },
        tools: {
          include: {
            tool: { select: { id: true, name: true, displayName: true, description: true, enabled: true } },
          },
        },
        workflowSteps: { orderBy: { order: 'asc' } },
        intents: { select: { id: true, name: true } },
      },
    });
    if (!agent) throw new NotFoundException('Agent not found');
    return {
      ...agent,
      knowledgeBases: agent.knowledgeBases.map((kb) => kb.knowledgeBase),
      tools: agent.tools.map((t) => t.tool),
    };
  }

  async create(data: {
    name: string;
    description?: string;
    type: string;
    systemPrompt?: string;
    modelId?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    toolConfig?: any;
    knowledgeBaseIds?: string[];
    toolIds?: string[];
  }) {
    const { knowledgeBaseIds, toolIds, ...agentData } = data;
    return this.prisma.agent.create({
      data: {
        ...agentData,
        knowledgeBases: knowledgeBaseIds
          ? {
              create: knowledgeBaseIds.map((kbId) => ({
                knowledgeBaseId: kbId,
              })),
            }
          : undefined,
        tools: toolIds
          ? {
              create: toolIds.map((toolId) => ({
                toolId,
              })),
            }
          : undefined,
      },
      include: {
        knowledgeBases: {
          include: { knowledgeBase: { select: { id: true, name: true } } },
        },
        tools: {
          include: {
            tool: { select: { id: true, name: true, displayName: true, enabled: true } },
          },
        },
      },
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      systemPrompt?: string;
      modelId?: string;
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      toolConfig?: any;
      knowledgeBaseIds?: string[];
      toolIds?: string[];
    },
  ) {
    await this.findOrThrow(id);
    const { knowledgeBaseIds, toolIds, ...agentData } = data;

    if (knowledgeBaseIds) {
      // Replace knowledge base bindings
      await this.prisma.agentKnowledgeBase.deleteMany({
        where: { agentId: id },
      });
      await this.prisma.agentKnowledgeBase.createMany({
        data: knowledgeBaseIds.map((kbId) => ({
          agentId: id,
          knowledgeBaseId: kbId,
        })),
      });
    }

    if (toolIds) {
      // Replace tool bindings
      await this.prisma.agentTool.deleteMany({
        where: { agentId: id },
      });
      await this.prisma.agentTool.createMany({
        data: toolIds.map((toolId) => ({
          agentId: id,
          toolId,
        })),
      });
    }

    return this.prisma.agent.update({
      where: { id },
      data: agentData,
      include: {
        knowledgeBases: {
          include: { knowledgeBase: { select: { id: true, name: true } } },
        },
        tools: {
          include: {
            tool: { select: { id: true, name: true, displayName: true, enabled: true } },
          },
        },
      },
    });
  }

  async delete(id: string) {
    await this.findOrThrow(id);
    return this.prisma.agent.delete({ where: { id } });
  }

  async duplicate(id: string) {
    const agent = await this.getById(id);
    const { knowledgeBases } = agent;

    return this.prisma.agent.create({
      data: {
        name: `${agent.name} (Copy)`,
        description: agent.description,
        type: agent.type,
        systemPrompt: agent.systemPrompt,
        modelId: agent.modelId,
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
        topP: agent.topP,
        toolConfig: agent.toolConfig ?? undefined,
        enabled: agent.enabled,
        knowledgeBases: {
          create: knowledgeBases.map((kb: any) => ({
            knowledgeBaseId: kb.knowledgeBaseId ?? kb.id,
          })),
        },
      },
    });
  }

  async toggle(id: string) {
    const agent = await this.findOrThrow(id);
    return this.prisma.agent.update({
      where: { id },
      data: { enabled: !agent.enabled },
    });
  }

  // Workflow steps CRUD
  async getSteps(agentId: string) {
    return this.prisma.workflowStep.findMany({
      where: { agentId },
      orderBy: { order: 'asc' },
    });
  }

  async createStep(
    agentId: string,
    data: { order: number; type: string; config: any; thenStepId?: string; elseStepId?: string },
  ) {
    return this.prisma.workflowStep.create({
      data: { agentId, ...data },
    });
  }

  async updateStep(stepId: string, data: { type?: string; config?: any; order?: number }) {
    return this.prisma.workflowStep.update({
      where: { id: stepId },
      data,
    });
  }

  async deleteStep(stepId: string) {
    return this.prisma.workflowStep.delete({ where: { id: stepId } });
  }

  private async findOrThrow(id: string) {
    const agent = await this.prisma.agent.findUnique({ where: { id } });
    if (!agent) throw new NotFoundException('Agent not found');
    return agent;
  }
}
