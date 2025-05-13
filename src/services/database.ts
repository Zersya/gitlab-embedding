import { Pool } from 'pg';
import dotenv from 'dotenv';
import { CodeEmbedding, ProjectMetadata, EmbeddingBatch } from '../models/embedding.js';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/repopo_reviewer';

class DatabaseService {
  private pool: Pool;
  private initialized: boolean = false;

  constructor() {
    this.pool = new Pool({
      connectionString: DATABASE_URL,
    });
  }

  async connect(): Promise<void> {
    try {
      // Test the connection
      const client = await this.pool.connect();
      client.release();
      console.log('Connected to PostgreSQL');

      // Initialize the database schema if not already done
      if (!this.initialized) {
        try {
          await this.initializeSchema();
          this.initialized = true;
        } catch (schemaError) {
          console.error('Failed to initialize schema, but continuing:', schemaError);
          // We'll still mark as initialized to avoid repeated attempts
          this.initialized = true;
        }
      }
    } catch (error) {
      console.error('Failed to connect to PostgreSQL', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.pool.end();
    console.log('Disconnected from PostgreSQL');
  }

  private async initializeSchema(): Promise<void> {
    const client = await this.pool.connect();
    let vectorExtensionAvailable = false;

    try {
      // Check if the vector extension is available without trying to create it
      try {
        const extensionCheck = await client.query(`
          SELECT 1 FROM pg_available_extensions WHERE name = 'vector'
        `);
        vectorExtensionAvailable = extensionCheck.rows.length > 0;

        if (vectorExtensionAvailable) {
          console.log('Vector extension is available');
        } else {
          console.warn('Vector extension is not available. Vector similarity search will not be available.');
          console.warn('You may need to install the pgvector extension on your PostgreSQL server');
        }
      } catch (error) {
        console.warn('Could not check for vector extension:', error);
        vectorExtensionAvailable = false;
      }

      // Create projects table
      await client.query(`
        CREATE TABLE IF NOT EXISTS projects (
          project_id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          url TEXT,
          default_branch TEXT,
          last_processed_commit TEXT,
          last_processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Create embeddings table based on vector extension availability
      if (vectorExtensionAvailable) {
        try {
          // Try to create the extension
          await client.query('CREATE EXTENSION IF NOT EXISTS vector');
          console.log('Vector extension enabled');

          // Create embeddings table with vector type
          await client.query(`
            CREATE TABLE IF NOT EXISTS embeddings (
              id SERIAL PRIMARY KEY,
              project_id INTEGER NOT NULL,
              repository_url TEXT,
              file_path TEXT NOT NULL,
              content TEXT,
              embedding vector(1536),
              language TEXT,
              commit_id TEXT NOT NULL,
              branch TEXT,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
              UNIQUE(project_id, file_path)
            )
          `);

          // Try to create a vector index
          try {
            await client.query('CREATE INDEX IF NOT EXISTS idx_embeddings_embedding ON embeddings USING ivfflat (embedding vector_cosine_ops)');
            console.log('Vector index created successfully');
          } catch (error) {
            console.warn('Could not create vector index, but continuing:', error);
          }
        } catch (error) {
          console.warn('Could not create embeddings table with vector type, falling back to JSONB:', error);
          vectorExtensionAvailable = false;
        }
      }

      // If vector extension is not available or failed, create table with JSONB
      if (!vectorExtensionAvailable) {
        await client.query(`
          CREATE TABLE IF NOT EXISTS embeddings (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL,
            repository_url TEXT,
            file_path TEXT NOT NULL,
            content TEXT,
            embedding JSONB,
            language TEXT,
            commit_id TEXT NOT NULL,
            branch TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(project_id, file_path)
          )
        `);
      }

      // Create batches table
      await client.query(`
        CREATE TABLE IF NOT EXISTS batches (
          id SERIAL PRIMARY KEY,
          project_id INTEGER NOT NULL,
          commit_id TEXT NOT NULL,
          branch TEXT,
          files JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Create indexes
      await client.query('CREATE INDEX IF NOT EXISTS idx_embeddings_project_id ON embeddings(project_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_embeddings_commit_id ON embeddings(commit_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_batches_project_id_commit_id ON batches(project_id, commit_id)');

      console.log('Database schema initialized');
    } catch (error) {
      console.error('Failed to initialize database schema:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async saveEmbedding(embedding: CodeEmbedding): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Check if we're using pgvector or JSONB for embeddings
      const res = await client.query(`
        SELECT data_type
        FROM information_schema.columns
        WHERE table_name = 'embeddings' AND column_name = 'embedding'
      `);

      const isVector = res.rows.length > 0 && res.rows[0].data_type === 'vector';

      if (isVector) {
        await client.query(`
          INSERT INTO embeddings (
            project_id, repository_url, file_path, content, embedding,
            language, commit_id, branch, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5::vector, $6, $7, $8, $9, $10)
          ON CONFLICT (project_id, file_path)
          DO UPDATE SET
            content = EXCLUDED.content,
            embedding = EXCLUDED.embedding,
            language = EXCLUDED.language,
            commit_id = EXCLUDED.commit_id,
            branch = EXCLUDED.branch,
            updated_at = EXCLUDED.updated_at
        `, [
          embedding.projectId,
          embedding.repositoryUrl,
          embedding.filePath,
          embedding.content,
          embedding.embedding,
          embedding.language,
          embedding.commitId,
          embedding.branch,
          embedding.createdAt,
          embedding.updatedAt
        ]);
      } else {
        // Fallback to JSONB if vector type is not available
        await client.query(`
          INSERT INTO embeddings (
            project_id, repository_url, file_path, content, embedding,
            language, commit_id, branch, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (project_id, file_path)
          DO UPDATE SET
            content = EXCLUDED.content,
            embedding = EXCLUDED.embedding,
            language = EXCLUDED.language,
            commit_id = EXCLUDED.commit_id,
            branch = EXCLUDED.branch,
            updated_at = EXCLUDED.updated_at
        `, [
          embedding.projectId,
          embedding.repositoryUrl,
          embedding.filePath,
          embedding.content,
          JSON.stringify(embedding.embedding),
          embedding.language,
          embedding.commitId,
          embedding.branch,
          embedding.createdAt,
          embedding.updatedAt
        ]);
      }
    } catch (error) {
      console.error('Error saving embedding:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async saveEmbeddings(embeddings: CodeEmbedding[]): Promise<void> {
    if (embeddings.length === 0) {
      return;
    }

    const client = await this.pool.connect();

    try {
      // Check if we're using pgvector or JSONB for embeddings
      const res = await client.query(`
        SELECT data_type
        FROM information_schema.columns
        WHERE table_name = 'embeddings' AND column_name = 'embedding'
      `);

      const isVector = res.rows.length > 0 && res.rows[0].data_type === 'vector';

      // Start a transaction
      await client.query('BEGIN');

      for (const embedding of embeddings) {
        if (isVector) {
          await client.query(`
            INSERT INTO embeddings (
              project_id, repository_url, file_path, content, embedding,
              language, commit_id, branch, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5::vector, $6, $7, $8, $9, $10)
            ON CONFLICT (project_id, file_path)
            DO UPDATE SET
              content = EXCLUDED.content,
              embedding = EXCLUDED.embedding,
              language = EXCLUDED.language,
              commit_id = EXCLUDED.commit_id,
              branch = EXCLUDED.branch,
              updated_at = EXCLUDED.updated_at
          `, [
            embedding.projectId,
            embedding.repositoryUrl,
            embedding.filePath,
            embedding.content,
            embedding.embedding,
            embedding.language,
            embedding.commitId,
            embedding.branch,
            embedding.createdAt,
            embedding.updatedAt
          ]);
        } else {
          // Fallback to JSONB if vector type is not available
          await client.query(`
            INSERT INTO embeddings (
              project_id, repository_url, file_path, content, embedding,
              language, commit_id, branch, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (project_id, file_path)
            DO UPDATE SET
              content = EXCLUDED.content,
              embedding = EXCLUDED.embedding,
              language = EXCLUDED.language,
              commit_id = EXCLUDED.commit_id,
              branch = EXCLUDED.branch,
              updated_at = EXCLUDED.updated_at
          `, [
            embedding.projectId,
            embedding.repositoryUrl,
            embedding.filePath,
            embedding.content,
            JSON.stringify(embedding.embedding),
            embedding.language,
            embedding.commitId,
            embedding.branch,
            embedding.createdAt,
            embedding.updatedAt
          ]);
        }
      }

      // Commit the transaction
      await client.query('COMMIT');
    } catch (error) {
      // Rollback the transaction in case of error
      await client.query('ROLLBACK');
      console.error('Error saving embeddings:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async saveBatch(batch: EmbeddingBatch): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query(`
        INSERT INTO batches (project_id, commit_id, branch, files, created_at)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        batch.projectId,
        batch.commitId,
        batch.branch,
        JSON.stringify(batch.files),
        batch.createdAt
      ]);
    } catch (error) {
      console.error('Error saving batch:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async updateProjectMetadata(metadata: ProjectMetadata): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query(`
        INSERT INTO projects (
          project_id, name, description, url, default_branch,
          last_processed_commit, last_processed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (project_id)
        DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          url = EXCLUDED.url,
          default_branch = EXCLUDED.default_branch,
          last_processed_commit = EXCLUDED.last_processed_commit,
          last_processed_at = EXCLUDED.last_processed_at
      `, [
        metadata.projectId,
        metadata.name,
        metadata.description,
        metadata.url,
        metadata.defaultBranch,
        metadata.lastProcessedCommit,
        metadata.lastProcessedAt
      ]);
    } catch (error) {
      console.error('Error updating project metadata:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getProjectMetadata(projectId: number): Promise<ProjectMetadata | null> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(`
        SELECT
          project_id as "projectId",
          name,
          description,
          url,
          default_branch as "defaultBranch",
          last_processed_commit as "lastProcessedCommit",
          last_processed_at as "lastProcessedAt"
        FROM projects
        WHERE project_id = $1
      `, [projectId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0] as ProjectMetadata;
    } catch (error) {
      console.error('Error getting project metadata:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getEmbeddingsByProject(projectId: number): Promise<CodeEmbedding[]> {
    const client = await this.pool.connect();

    try {
      // Check if we're using pgvector or JSONB for embeddings
      const typeRes = await client.query(`
        SELECT data_type
        FROM information_schema.columns
        WHERE table_name = 'embeddings' AND column_name = 'embedding'
      `);

      const isVector = typeRes.rows.length > 0 && typeRes.rows[0].data_type === 'vector';

      const result = await client.query(`
        SELECT
          project_id as "projectId",
          repository_url as "repositoryUrl",
          file_path as "filePath",
          content,
          embedding,
          language,
          commit_id as "commitId",
          branch,
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM embeddings
        WHERE project_id = $1
      `, [projectId]);

      // Convert embedding from JSONB to array if needed
      return result.rows.map((row: any) => {
        if (!isVector && typeof row.embedding === 'string') {
          row.embedding = JSON.parse(row.embedding);
        }
        return row as CodeEmbedding;
      });
    } catch (error) {
      console.error('Error getting embeddings by project:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getEmbeddingsByCommit(projectId: number, commitId: string): Promise<CodeEmbedding[]> {
    const client = await this.pool.connect();

    try {
      // Check if we're using pgvector or JSONB for embeddings
      const typeRes = await client.query(`
        SELECT data_type
        FROM information_schema.columns
        WHERE table_name = 'embeddings' AND column_name = 'embedding'
      `);

      const isVector = typeRes.rows.length > 0 && typeRes.rows[0].data_type === 'vector';

      const result = await client.query(`
        SELECT
          project_id as "projectId",
          repository_url as "repositoryUrl",
          file_path as "filePath",
          content,
          embedding,
          language,
          commit_id as "commitId",
          branch,
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM embeddings
        WHERE project_id = $1 AND commit_id = $2
      `, [projectId, commitId]);

      // Convert embedding from JSONB to array if needed
      return result.rows.map((row: any) => {
        if (!isVector && typeof row.embedding === 'string') {
          row.embedding = JSON.parse(row.embedding);
        }
        return row as CodeEmbedding;
      });
    } catch (error) {
      console.error('Error getting embeddings by commit:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async searchSimilarCode(projectId: number, embedding: number[], limit: number = 10): Promise<CodeEmbedding[]> {
    const client = await this.pool.connect();

    try {
      // Check if we're using pgvector or JSONB for embeddings
      const typeRes = await client.query(`
        SELECT data_type
        FROM information_schema.columns
        WHERE table_name = 'embeddings' AND column_name = 'embedding'
      `);

      const isVector = typeRes.rows.length > 0 && typeRes.rows[0].data_type === 'vector';

      if (isVector) {
        try {
          // Try to use pgvector for similarity search
          const result = await client.query(`
            SELECT
              project_id as "projectId",
              repository_url as "repositoryUrl",
              file_path as "filePath",
              content,
              embedding,
              language,
              commit_id as "commitId",
              branch,
              created_at as "createdAt",
              updated_at as "updatedAt",
              1 - (embedding <=> $1) as similarity
            FROM embeddings
            WHERE project_id = $2
            ORDER BY embedding <=> $1
            LIMIT $3
          `, [embedding, projectId, limit]);

          return result.rows as CodeEmbedding[];
        } catch (error) {
          console.warn('Vector similarity search failed, falling back to basic filtering:', error);
        }
      }

      // Fallback to basic filtering if vector search is not available
      console.warn('Vector similarity search not available, falling back to basic filtering');

      const result = await client.query(`
        SELECT
          project_id as "projectId",
          repository_url as "repositoryUrl",
          file_path as "filePath",
          content,
          embedding,
          language,
          commit_id as "commitId",
          branch,
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM embeddings
        WHERE project_id = $1
        ORDER BY updated_at DESC
        LIMIT $2
      `, [projectId, limit]);

      // Convert embedding from JSONB to array if needed
      return result.rows.map((row: any) => {
        if (!isVector && typeof row.embedding === 'string') {
          row.embedding = JSON.parse(row.embedding);
        }
        return row as CodeEmbedding;
      });
    } catch (error) {
      console.error('Error searching similar code:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async searchSimilarCodeAcrossProjects(embedding: number[], limit: number = 10): Promise<CodeEmbedding[]> {
    const client = await this.pool.connect();

    try {
      // Check if we're using pgvector or JSONB for embeddings
      const typeRes = await client.query(`
        SELECT data_type
        FROM information_schema.columns
        WHERE table_name = 'embeddings' AND column_name = 'embedding'
      `);

      const isVector = typeRes.rows.length > 0 && typeRes.rows[0].data_type === 'vector';

      if (isVector) {
        try {
          // Try to use pgvector for similarity search across all projects
          const result = await client.query(`
            SELECT
              project_id as "projectId",
              repository_url as "repositoryUrl",
              file_path as "filePath",
              content,
              embedding,
              language,
              commit_id as "commitId",
              branch,
              created_at as "createdAt",
              updated_at as "updatedAt",
              1 - (embedding <=> $1) as similarity
            FROM embeddings
            ORDER BY embedding <=> $1
            LIMIT $2
          `, [embedding, limit]);

          return result.rows as CodeEmbedding[];
        } catch (error) {
          console.warn('Vector similarity search failed, falling back to basic filtering:', error);
        }
      }

      // Fallback to basic filtering if vector search is not available
      console.warn('Vector similarity search not available, falling back to basic filtering');

      const result = await client.query(`
        SELECT
          project_id as "projectId",
          repository_url as "repositoryUrl",
          file_path as "filePath",
          content,
          embedding,
          language,
          commit_id as "commitId",
          branch,
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM embeddings
        ORDER BY updated_at DESC
        LIMIT $1
      `, [limit]);

      // Convert embedding from JSONB to array if needed
      return result.rows.map((row: any) => {
        if (!isVector && typeof row.embedding === 'string') {
          row.embedding = JSON.parse(row.embedding);
        }
        return row as CodeEmbedding;
      });
    } catch (error) {
      console.error('Error searching similar code across projects:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getAllProjects(): Promise<ProjectMetadata[]> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(`
        SELECT
          project_id as "projectId",
          name,
          description,
          url,
          default_branch as "defaultBranch",
          last_processed_commit as "lastProcessedCommit",
          last_processed_at as "lastProcessedAt"
        FROM projects
        ORDER BY name
      `);

      return result.rows as ProjectMetadata[];
    } catch (error) {
      console.error('Error getting all projects:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async saveProjectMetadata(metadata: ProjectMetadata): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query(`
        INSERT INTO projects (
          project_id, name, description, url, default_branch,
          last_processed_commit, last_processed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (project_id)
        DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          url = EXCLUDED.url,
          default_branch = EXCLUDED.default_branch,
          last_processed_commit = EXCLUDED.last_processed_commit,
          last_processed_at = EXCLUDED.last_processed_at
      `, [
        metadata.projectId,
        metadata.name,
        metadata.description,
        metadata.url,
        metadata.defaultBranch,
        metadata.lastProcessedCommit,
        metadata.lastProcessedAt
      ]);
    } catch (error) {
      console.error('Error saving project metadata:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

export const dbService = new DatabaseService();
