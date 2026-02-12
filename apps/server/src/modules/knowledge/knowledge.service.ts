import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('knowledge-processing') private readonly processingQueue: Queue,
  ) {}

  // ========== Knowledge Bases ==========

  async createBase(name: string, description?: string) {
    return this.prisma.knowledgeBase.create({
      data: { name, description },
    });
  }

  async listBases() {
    const bases = await this.prisma.knowledgeBase.findMany({
      include: { _count: { select: { documents: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return bases.map((b) => ({
      ...b,
      documentCount: b._count.documents,
      _count: undefined,
    }));
  }

  async updateBase(id: string, data: { name?: string; description?: string }) {
    await this.findBaseOrThrow(id);
    return this.prisma.knowledgeBase.update({ where: { id }, data });
  }

  async deleteBase(id: string) {
    await this.findBaseOrThrow(id);
    return this.prisma.knowledgeBase.delete({ where: { id } });
  }

  // ========== Categories ==========

  async listCategories(baseId: string) {
    return this.prisma.knowledgeCategory.findMany({
      where: { knowledgeBaseId: baseId },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(baseId: string, name: string, parentId?: string) {
    return this.prisma.knowledgeCategory.create({
      data: { name, knowledgeBaseId: baseId, parentId },
    });
  }

  async updateCategory(id: string, name: string) {
    return this.prisma.knowledgeCategory.update({
      where: { id },
      data: { name },
    });
  }

  async deleteCategory(id: string) {
    return this.prisma.knowledgeCategory.delete({ where: { id } });
  }

  // ========== Documents ==========

  async listDocuments(baseId: string) {
    return this.prisma.knowledgeDocument.findMany({
      where: { knowledgeBaseId: baseId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        categoryId: true,
        createdAt: true,
      },
    });
  }

  async uploadDocument(
    baseId: string,
    name: string,
    type: string,
    filePath: string,
    categoryId?: string,
  ) {
    const doc = await this.prisma.knowledgeDocument.create({
      data: {
        name,
        type,
        filePath,
        status: 'pending',
        knowledgeBaseId: baseId,
        categoryId,
      },
    });

    // Enqueue for async processing (parsing + chunking + embedding)
    await this.processingQueue.add('process-document', {
      documentId: doc.id,
    });

    return doc;
  }

  async createRichTextEntry(
    baseId: string,
    name: string,
    content: string,
    categoryId?: string,
  ) {
    const doc = await this.prisma.knowledgeDocument.create({
      data: {
        name,
        type: 'richtext',
        content,
        status: 'pending',
        knowledgeBaseId: baseId,
        categoryId,
      },
    });

    await this.processingQueue.add('process-document', {
      documentId: doc.id,
    });

    return doc;
  }

  async getDocument(id: string) {
    const doc = await this.prisma.knowledgeDocument.findUnique({
      where: { id },
      include: {
        chunks: {
          select: { id: true, content: true, metadata: true },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async updateDocument(
    id: string,
    data: { name?: string; content?: string },
  ) {
    const doc = await this.prisma.knowledgeDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');

    // Only richtext (non-uploaded) documents can have their content edited
    if (data.content !== undefined && doc.type !== 'richtext') {
      throw new Error('Only manually created knowledge entries can be edited');
    }

    const updated = await this.prisma.knowledgeDocument.update({
      where: { id },
      data: {
        name: data.name,
        content: data.content,
        status: data.content !== undefined ? 'pending' : undefined,
      },
    });

    // Re-process if content changed (re-chunk and re-embed)
    if (data.content !== undefined) {
      // Delete old chunks
      await this.prisma.knowledgeChunk.deleteMany({ where: { documentId: id } });

      // Enqueue for re-processing
      await this.processingQueue.add('process-document', {
        documentId: id,
      });
    }

    return updated;
  }

  async deleteDocument(id: string) {
    const doc = await this.prisma.knowledgeDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');

    // Delete associated chunks first
    await this.prisma.knowledgeChunk.deleteMany({ where: { documentId: id } });

    // Delete the file if it exists
    if (doc.filePath) {
      const fs = await import('fs');
      try {
        fs.unlinkSync(doc.filePath);
      } catch {
        // Ignore file not found errors
      }
    }

    return this.prisma.knowledgeDocument.delete({ where: { id } });
  }

  async learnFromReply(
    baseId: string,
    customerMessage: string,
    agentReply: string,
  ) {
    const content = `Q: ${customerMessage}\nA: ${agentReply}`;
    return this.createRichTextEntry(baseId, 'Learned from reply', content);
  }

  private async findBaseOrThrow(id: string) {
    const base = await this.prisma.knowledgeBase.findUnique({ where: { id } });
    if (!base) throw new NotFoundException('Knowledge base not found');
    return base;
  }
}
