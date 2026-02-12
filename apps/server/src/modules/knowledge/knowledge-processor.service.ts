import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmService } from '../settings/llm.service';
import * as fs from 'fs';

@Processor('knowledge-processing')
export class KnowledgeProcessorService extends WorkerHost {
  private readonly logger = new Logger(KnowledgeProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
  ) {
    super();
  }

  async process(job: Job<{ documentId: string }>) {
    const { documentId } = job.data;
    this.logger.log(`Processing document: ${documentId}`);

    try {
      await this.prisma.knowledgeDocument.update({
        where: { id: documentId },
        data: { status: 'processing' },
      });

      const doc = await this.prisma.knowledgeDocument.findUnique({
        where: { id: documentId },
      });

      if (!doc) throw new Error('Document not found');

      // 1. Extract text content
      let textContent = doc.content || '';
      if (!textContent && doc.filePath) {
        textContent = await this.extractText(doc.filePath, doc.type);
      }

      if (!textContent) {
        throw new Error('No content to process');
      }

      // Update content
      await this.prisma.knowledgeDocument.update({
        where: { id: documentId },
        data: { content: textContent },
      });

      // 2. Chunk text
      const chunks = this.chunkText(textContent, 1000, 200);

      // 3. Generate embeddings and store chunks
      let embeddingSuccess = true;
      for (let i = 0; i < chunks.length; i += 10) {
        const batch = chunks.slice(i, i + 10);

        // Try to generate embeddings, fall back to storing without them
        let embeddings: Array<{ embedding: number[] }> | null = null;
        try {
          embeddings = await this.llmService.embedBatch(batch);
        } catch (err) {
          if (embeddingSuccess) {
            this.logger.warn(
              `Embedding generation failed, storing chunks without embeddings: ${(err as Error).message}`,
            );
            embeddingSuccess = false;
          }
        }

        for (let j = 0; j < batch.length; j++) {
          await this.prisma.knowledgeChunk.create({
            data: {
              content: batch[j],
              documentId,
              metadata: { index: i + j },
              embedding: embeddings ? embeddings[j]?.embedding : undefined,
            },
          });
        }
      }

      await this.prisma.knowledgeDocument.update({
        where: { id: documentId },
        data: { status: 'ready' },
      });

      if (embeddingSuccess) {
        this.logger.log(
          `Document ${documentId} processed: ${chunks.length} chunks with embeddings`,
        );
      } else {
        this.logger.warn(
          `Document ${documentId} processed: ${chunks.length} chunks (without embeddings - configure LLM API to enable semantic search)`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Document processing failed: ${(error as Error).message}`,
      );
      await this.prisma.knowledgeDocument.update({
        where: { id: documentId },
        data: { status: 'failed' },
      });
      throw error;
    }
  }

  private async extractText(filePath: string, type: string): Promise<string> {
    const buffer = fs.readFileSync(filePath);

    switch (type) {
      case 'txt':
        return buffer.toString('utf-8');

      case 'pdf': {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pdfParse = require('pdf-parse');
        const pdf = await pdfParse(buffer);
        return pdf.text;
      }

      case 'docx': {
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
      }

      case 'xlsx':
      case 'xls': {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const texts: string[] = [];
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          texts.push(XLSX.utils.sheet_to_csv(sheet));
        }
        return texts.join('\n\n');
      }

      case 'html':
        return buffer
          .toString('utf-8')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

      default:
        return buffer.toString('utf-8');
    }
  }

  private chunkText(
    text: string,
    chunkSize: number,
    overlap: number,
  ): string[] {
    const chunks: string[] = [];
    const separators = ['\n\n', '\n', '. ', ' '];

    const splitRecursive = (text: string, size: number): string[] => {
      if (text.length <= size) return [text];

      for (const sep of separators) {
        const parts = text.split(sep);
        if (parts.length > 1) {
          const result: string[] = [];
          let current = '';
          for (const part of parts) {
            if ((current + sep + part).length > size && current) {
              result.push(current.trim());
              // overlap: keep end of previous chunk
              const overlapText = current.slice(-overlap);
              current = overlapText + sep + part;
            } else {
              current = current ? current + sep + part : part;
            }
          }
          if (current.trim()) result.push(current.trim());
          return result;
        }
      }

      // Fallback: hard split
      const result: string[] = [];
      for (let i = 0; i < text.length; i += chunkSize - overlap) {
        result.push(text.slice(i, i + chunkSize));
      }
      return result;
    };

    return splitRecursive(text, chunkSize).filter((c) => c.length > 0);
  }
}
