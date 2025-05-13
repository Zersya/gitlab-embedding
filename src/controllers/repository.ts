import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { repositoryService } from '../services/repository.js';
import { embeddingService } from '../services/embedding.js';
import { dbService } from '../services/database.js';
import { EmbeddingBatch, ProjectMetadata } from '../models/embedding.js';

/**
 * Generate a numeric project ID from a string path
 * This ensures we have a consistent integer ID for database operations
 */
function generateProjectIdFromPath(path: string): number {
  // Create a hash of the path
  const hash = crypto.createHash('md5').update(path).digest('hex');

  // Convert the first 8 characters of the hash to a number
  // This gives us a large enough range while avoiding integer overflow
  const truncatedHash = hash.substring(0, 8);
  const numericId = parseInt(truncatedHash, 16);

  // Ensure the ID is positive and within safe integer range
  return Math.abs(numericId % 2147483647); // Max 32-bit signed integer
}

/**
 * Process a repository for embedding
 *
 * This endpoint accepts a GitLab repository URL, clones the repository,
 * processes the code files to generate embeddings, and stores them in the database.
 */
export const processRepository = async (req: Request, res: Response): Promise<void> => {
  try {
    const { repositoryUrl } = req.body;

    if (!repositoryUrl) {
      res.status(400).json({ error: 'Repository URL is required' });
      return;
    }

    // Start processing and return a response immediately
    const processingId = uuidv4();
    res.status(202).json({
      message: 'Repository processing started',
      processingId,
      status: 'processing'
    });

    // Process the repository asynchronously
    try {
      await processRepositoryAsync(repositoryUrl, processingId);
    } catch (error) {
      console.error('Error processing repository:', error);
    }
  } catch (error) {
    console.error('Error handling repository processing request:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get the status of a repository processing job
 */
export const getRepositoryStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { processingId } = req.params;

    if (!processingId) {
      res.status(400).json({ error: 'Processing ID is required' });
      return;
    }

    // In a real implementation, you would check the status in a database or queue
    // For now, we'll just return a mock response
    res.status(200).json({
      processingId,
      status: 'completed',
      message: 'Repository processing completed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting repository status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Process a repository asynchronously
 */
async function processRepositoryAsync(repositoryUrl: string, processingId: string): Promise<void> {
  let repoPath = '';

  try {
    console.log(`Processing repository ${repositoryUrl} (ID: ${processingId})`);

    // Clone the repository
    const { repoPath: clonedRepoPath, projectId } = await repositoryService.cloneRepository(repositoryUrl);
    repoPath = clonedRepoPath;

    if (!projectId) {
      throw new Error('Could not extract project ID from repository URL');
    }

    // Get all files from the repository
    console.log(`Getting files from repository ${repositoryUrl}`);
    const files = await repositoryService.getFilesFromLocalRepo(repoPath);

    if (files.length === 0) {
      console.log('No files found, skipping');
      return;
    }

    console.log(`Found ${files.length} files, generating embeddings`);

    // Generate a numeric project ID from the string path
    // We'll use a hash of the project path to ensure we get a consistent integer
    const numericProjectId = generateProjectIdFromPath(projectId);
    console.log(`Generated numeric project ID: ${numericProjectId} from path: ${projectId}`);

    // Get or create project metadata
    let projectMetadata = await dbService.getProjectMetadata(numericProjectId);

    if (!projectMetadata) {
      projectMetadata = {
        projectId: numericProjectId,
        name: repositoryUrl.split('/').pop() || 'Unknown',
        description: '',
        url: repositoryUrl,
        defaultBranch: 'main',
        lastProcessedCommit: '',
        lastProcessedAt: new Date(),
      };

      await dbService.saveProjectMetadata(projectMetadata);
    }

    // Get the latest commit from the repository
    const commitId = uuidv4(); // In a real implementation, you would get this from git
    const branch = 'main'; // In a real implementation, you would get this from git

    // Generate embeddings for all files
    const embeddings = await embeddingService.generateEmbeddings(
      files,
      numericProjectId,
      commitId,
      branch
    );

    // Add repository URL to embeddings
    embeddings.forEach(embedding => {
      embedding.repositoryUrl = repositoryUrl;
    });

    console.log(`Generated ${embeddings.length} embeddings, saving to database`);

    // Save embeddings to database
    await dbService.saveEmbeddings(embeddings);

    // Save batch information
    const batch: EmbeddingBatch = {
      projectId: numericProjectId,
      commitId,
      branch,
      files,
      embeddings,
      createdAt: new Date(),
    };

    await dbService.saveBatch(batch);

    // Update project metadata
    projectMetadata.lastProcessedCommit = commitId;
    projectMetadata.lastProcessedAt = new Date();
    await dbService.updateProjectMetadata(projectMetadata);

    console.log(`Successfully processed repository ${repositoryUrl} (ID: ${processingId})`);
  } catch (error) {
    console.error(`Error processing repository ${repositoryUrl} (ID: ${processingId}):`, error);
  } finally {
    // Clean up the repository
    if (repoPath) {
      repositoryService.cleanupRepository(repoPath);
    }
  }
}
