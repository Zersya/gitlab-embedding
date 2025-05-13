// Embedding model for storing code embeddings

export interface CodeFile {
  path: string;
  content: string;
  language: string;
  lastModified: Date;
}

export interface CodeEmbedding {
  projectId: number;
  repositoryUrl: string;
  filePath: string;
  content: string;
  embedding: number[];
  language: string;
  commitId: string;
  branch: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectMetadata {
  projectId: number;
  name: string;
  description: string;
  url: string;
  defaultBranch: string;
  lastProcessedCommit: string;
  lastProcessedAt: Date;
}

export interface EmbeddingBatch {
  projectId: number;
  commitId: string;
  branch: string;
  files: CodeFile[];
  embeddings: CodeEmbedding[];
  createdAt: Date;
}
