import { Request, Response } from 'express';
import { embeddingService } from '../services/embedding.js';
import { dbService } from '../services/database.js';
import { llmService } from '../services/llm.js';
import { CodeEmbedding } from '../models/embedding.js';

/**
 * Search for code using vector similarity
 *
 * This endpoint accepts a search query, converts it to an embedding,
 * searches for similar code in the database, and returns the results.
 */
export const searchCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { query, projectId, limit = 10, analyze = false } = req.body;

    if (!query) {
      res.status(400).json({ error: 'Search query is required' });
      return;
    }

    // Generate embedding for the query
    console.log(`Generating embedding for query: ${query}`);
    const queryEmbedding = await embeddingService.generateEmbedding(query);

    // Search for similar code
    let results: CodeEmbedding[] = [];

    if (projectId) {
      // Search within a specific project
      console.log(`Searching for code similar to query in project ${projectId}`);
      results = await dbService.searchSimilarCode(projectId, queryEmbedding, limit);
    } else {
      // Search across all projects
      console.log(`Searching for code similar to query across all projects`);
      results = await dbService.searchSimilarCodeAcrossProjects(queryEmbedding, limit);
    }

    if (results.length === 0) {
      res.status(404).json({
        message: 'No matching code found',
        query,
        results: []
      });
      return;
    }

    // If analyze flag is set, use LLM to analyze the results
    let analysis = null;
    if (analyze && results.length > 0) {
      console.log(`Analyzing ${results.length} code snippets with LLM`);
      analysis = await llmService.analyzeCode(query, results);
    }

    // Format the response
    const response = {
      query,
      results: results.map(result => ({
        projectId: result.projectId,
        repositoryUrl: result.repositoryUrl,
        filePath: result.filePath,
        language: result.language,
        content: result.content,
        commitId: result.commitId,
        branch: result.branch,
        createdAt: result.createdAt,
        // Don't include the embedding in the response
      })),
      analysis,
      count: results.length,
      timestamp: new Date().toISOString()
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error searching code:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get a list of all projects that have embeddings
 */
export const listProjects = async (req: Request, res: Response): Promise<void> => {
  try {
    const projects = await dbService.getAllProjects();

    res.status(200).json({
      projects,
      count: projects.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error listing projects:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
