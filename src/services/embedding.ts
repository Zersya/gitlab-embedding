import axios from 'axios';
import dotenv from 'dotenv';
import { CodeFile, CodeEmbedding } from '../models/embedding.js';

dotenv.config();

const QODO_EMBED_API_URL = process.env.QODO_EMBED_API_URL || 'http://localhost:8000/v1/embeddings';

const qodoApi = axios.create({
  baseURL: QODO_EMBED_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export class EmbeddingService {
  /**
   * Generate embeddings for a single code file
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await qodoApi.post('', {
        model: 'qodo-embed-1',
        input: text,
      });

      return response.data.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple code files in batches
   */
  async generateEmbeddings(files: CodeFile[], projectId: number, commitId: string, branch: string): Promise<CodeEmbedding[]> {
    const embeddings: CodeEmbedding[] = [];
    const batchSize = 5; // Process files in small batches to avoid rate limits

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      console.log(`Processing batch ${i / batchSize + 1} of ${Math.ceil(files.length / batchSize)}`);

      const batchPromises = batch.map(async (file) => {
        try {
          // Skip binary files, large files, or files without content
          if (!file.content || file.content.length > 100000 || this.isBinaryContent(file.content)) {
            return null;
          }

          const embedding = await this.generateEmbedding(file.content);

          return {
            projectId,
            repositoryUrl: '',  // Will be filled in by the caller
            filePath: file.path,
            content: file.content,
            embedding,
            language: file.language,
            commitId,
            branch,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        } catch (error) {
          console.error(`Error processing embedding for file ${file.path}:`, error);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      embeddings.push(...batchResults.filter(Boolean) as CodeEmbedding[]);

      // Add a small delay between batches to avoid rate limiting
      if (i + batchSize < files.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return embeddings;
  }

  /**
   * Simple check to detect binary content
   */
  private isBinaryContent(content: string): boolean {
    // Check for null bytes or a high ratio of non-printable characters
    if (content.includes('\0')) {
      return true;
    }

    const nonPrintableCount = content.split('').filter(char => {
      const code = char.charCodeAt(0);
      return code < 32 && code !== 9 && code !== 10 && code !== 13; // Exclude tabs, newlines, and carriage returns
    }).length;

    // If more than 10% of characters are non-printable, consider it binary
    return nonPrintableCount > content.length * 0.1;
  }

  /**
   * Chunk large files into smaller segments for embedding
   * This is useful for very large files that might exceed token limits
   */
  chunkCodeFile(file: CodeFile, maxChunkSize: number = 8000): CodeFile[] {
    if (!file.content || file.content.length <= maxChunkSize) {
      return [file];
    }

    const chunks: CodeFile[] = [];
    const lines = file.content.split('\n');
    let currentChunk = '';
    let chunkIndex = 0;

    for (const line of lines) {
      if (currentChunk.length + line.length + 1 > maxChunkSize) {
        chunks.push({
          ...file,
          path: `${file.path}#chunk${chunkIndex}`,
          content: currentChunk,
        });

        currentChunk = line + '\n';
        chunkIndex++;
      } else {
        currentChunk += line + '\n';
      }
    }

    if (currentChunk) {
      chunks.push({
        ...file,
        path: `${file.path}#chunk${chunkIndex}`,
        content: currentChunk,
      });
    }

    return chunks;
  }
}

export const embeddingService = new EmbeddingService();
