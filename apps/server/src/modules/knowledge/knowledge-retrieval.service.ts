import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmService } from '../settings/llm.service';

export interface RetrievalResult {
  chunkId: string;
  content: string;
  similarity: number;
  documentId: string;
  metadata: any;
}

@Injectable()
export class KnowledgeRetrievalService {
  private readonly logger = new Logger(KnowledgeRetrievalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
  ) {}

  async retrieve(
    query: string,
    knowledgeBaseIds?: string[],
    topK = 5,
    threshold = 0.7,
  ): Promise<RetrievalResult[]> {
    // Try semantic search first, fall back to keyword search
    try {
      const results = await this.semanticSearch(query, knowledgeBaseIds, topK, threshold);
      if (results.length > 0) return results;
    } catch (error) {
      this.logger.warn(`Semantic search failed, falling back to keyword search: ${(error as Error).message}`);
    }

    // Fallback: keyword-based search
    return this.keywordSearch(query, knowledgeBaseIds, topK);
  }

  private async semanticSearch(
    query: string,
    knowledgeBaseIds?: string[],
    topK = 5,
    threshold = 0.7,
  ): Promise<RetrievalResult[]> {
    // Generate query embedding
    const { embedding: queryEmbedding } = await this.llmService.embed(query);

    // Fetch all chunks with embeddings from the relevant knowledge bases
    const whereClause: any = {
      embedding: { not: null },
    };
    if (knowledgeBaseIds && knowledgeBaseIds.length > 0) {
      whereClause.document = {
        knowledgeBaseId: { in: knowledgeBaseIds },
      };
    }

    const chunks = await this.prisma.knowledgeChunk.findMany({
      where: whereClause,
      select: {
        id: true,
        content: true,
        documentId: true,
        metadata: true,
        embedding: true,
      },
    });

    // Calculate cosine similarity in memory
    const results: RetrievalResult[] = [];

    for (const chunk of chunks) {
      const chunkEmbedding = chunk.embedding as number[] | null;
      if (!Array.isArray(chunkEmbedding)) continue;

      const similarity = this.cosineSimilarity(queryEmbedding, chunkEmbedding);
      if (similarity >= threshold) {
        results.push({
          chunkId: chunk.id,
          content: chunk.content,
          similarity,
          documentId: chunk.documentId,
          metadata: chunk.metadata,
        });
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, topK);
  }

  private async keywordSearch(
    query: string,
    knowledgeBaseIds?: string[],
    topK = 5,
  ): Promise<RetrievalResult[]> {
    // Split query into keywords, with CJK-aware tokenization
    const keywords = this.tokenizeForSearch(query);

    this.logger.debug(
      `Keyword search: query="${query.slice(0, 50)}", tokens=[${keywords.slice(0, 10).join(', ')}], knowledgeBases=${knowledgeBaseIds?.length ?? 'all'}`,
    );

    if (keywords.length === 0) return [];

    const whereClause: any = {};
    if (knowledgeBaseIds && knowledgeBaseIds.length > 0) {
      whereClause.document = {
        knowledgeBaseId: { in: knowledgeBaseIds },
      };
    }

    // Use OR conditions for keyword matching
    whereClause.OR = keywords.map((keyword) => ({
      content: { contains: keyword, mode: 'insensitive' },
    }));

    const chunks = await this.prisma.knowledgeChunk.findMany({
      where: whereClause,
      select: {
        id: true,
        content: true,
        documentId: true,
        metadata: true,
      },
      take: topK * 3, // fetch more candidates for scoring
    });

    this.logger.debug(`Keyword search found ${chunks.length} candidate chunks`);

    // Score by keyword match count
    const results: RetrievalResult[] = chunks.map((chunk) => {
      const lowerContent = chunk.content.toLowerCase();
      const matchCount = keywords.filter((k) => lowerContent.includes(k)).length;
      return {
        chunkId: chunk.id,
        content: chunk.content,
        similarity: matchCount / keywords.length, // rough relevance score
        documentId: chunk.documentId,
        metadata: chunk.metadata,
      };
    });

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, topK);
  }

  /**
   * Tokenize query text for keyword search.
   * Handles CJK text (Chinese/Japanese/Korean) by extracting bigrams,
   * since CJK languages don't use spaces between words.
   */
  private tokenizeForSearch(query: string): string[] {
    const tokens = new Set<string>();
    const lower = query.toLowerCase();

    // 1. Extract non-CJK words (space/punctuation separated, like English)
    const nonCjkWords = lower
      .replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, ' ')
      .split(/[\s,，。.!！?？;；:：、""''（）()【】\[\]{}]+/)
      .filter((w) => w.length > 1);
    for (const w of nonCjkWords) tokens.add(w);

    // 2. Extract CJK characters and create bigrams
    const cjkChars = lower.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+/g) || [];
    for (const segment of cjkChars) {
      // Add individual chars (for single-character important terms)
      if (segment.length >= 2) {
        // Create bigrams (2-char sliding window) — effective for Chinese
        for (let i = 0; i < segment.length - 1; i++) {
          tokens.add(segment.slice(i, i + 2));
        }
        // Also add the full segment if it's short enough (likely a word/phrase)
        if (segment.length <= 4) {
          tokens.add(segment);
        }
      } else {
        tokens.add(segment);
      }
    }

    // 3. Remove common stop words
    const stopWords = new Set([
      '的', '了', '在', '是', '我', '你', '他', '她', '它', '们',
      '这', '那', '有', '和', '与', '或', '但', '不', '也', '都',
      '就', '要', '会', '可', '能', '很', '吗', '吧', '呢', '啊',
      '把', '被', '让', '给', '从', '到', '对', '向', '于', '以',
      '一', '个', '上', '下', '大', '小', 'the', 'is', 'at', 'a',
      '请', '想', '好', '么', '什', '怎',
    ]);

    return Array.from(tokens).filter((t) => !stopWords.has(t) && t.length > 0);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dotProduct / denom;
  }
}
