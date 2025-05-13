import axios from 'axios';
import dotenv from 'dotenv';
import { CodeFile } from '../models/embedding.js';

dotenv.config();

const GITLAB_API_URL = process.env.GITLAB_API_URL || 'https://gitlab.com/api/v4';
const GITLAB_API_TOKEN = process.env.GITLAB_API_TOKEN;

if (!GITLAB_API_TOKEN) {
  console.error('GITLAB_API_TOKEN is not set');
  process.exit(1);
}

const gitlabApi = axios.create({
  baseURL: GITLAB_API_URL,
  headers: {
    'PRIVATE-TOKEN': GITLAB_API_TOKEN,
    'Content-Type': 'application/json',
  },
});

export class GitLabService {
  /**
   * Get repository tree (list of files) for a specific commit
   */
  async getRepositoryTree(projectId: number | string, ref: string, recursive: boolean = true): Promise<any[]> {
    try {
      const response = await gitlabApi.get(`/projects/${encodeURIComponent(projectId.toString())}/repository/tree`, {
        params: {
          ref,
          recursive,
          per_page: 100,
        },
      });

      return response.data;
    } catch (error) {
      console.error('Error fetching repository tree:', error);
      throw error;
    }
  }

  /**
   * Get file content from repository
   */
  async getFileContent(projectId: number | string, filePath: string, ref: string): Promise<string> {
    try {
      const response = await gitlabApi.get(`/projects/${encodeURIComponent(projectId.toString())}/repository/files/${encodeURIComponent(filePath)}/raw`, {
        params: { ref },
        responseType: 'text',
      });

      return response.data;
    } catch (error) {
      console.error(`Error fetching file content for ${filePath}:`, error);
      return '';
    }
  }

  /**
   * Get all files from a repository at a specific commit
   */
  async getAllFiles(projectId: number | string, ref: string): Promise<CodeFile[]> {
    try {
      const tree = await this.getRepositoryTree(projectId, ref, true);
      const files: CodeFile[] = [];

      // Filter only files (not directories)
      const fileEntries = tree.filter(item => item.type === 'blob');

      // Process files in batches to avoid overwhelming the API
      const batchSize = 10;
      for (let i = 0; i < fileEntries.length; i += batchSize) {
        const batch = fileEntries.slice(i, i + batchSize);
        const batchPromises = batch.map(async (file) => {
          try {
            const content = await this.getFileContent(projectId, file.path, ref);
            const language = this.detectLanguage(file.path);

            return {
              path: file.path,
              content,
              language,
              lastModified: new Date(),
            };
          } catch (error) {
            console.error(`Error processing file ${file.path}:`, error);
            return null;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        files.push(...batchResults.filter(Boolean) as CodeFile[]);
      }

      return files;
    } catch (error) {
      console.error('Error fetching all files:', error);
      throw error;
    }
  }

  /**
   * Get project details
   */
  async getProject(projectId: number | string): Promise<any> {
    try {
      const response = await gitlabApi.get(`/projects/${encodeURIComponent(projectId.toString())}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching project details:', error);
      throw error;
    }
  }

  /**
   * Get commit details
   */
  async getCommit(projectId: number | string, commitSha: string): Promise<any> {
    try {
      const response = await gitlabApi.get(`/projects/${encodeURIComponent(projectId.toString())}/repository/commits/${commitSha}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching commit details:', error);
      throw error;
    }
  }

  /**
   * Get merge request details
   */
  async getMergeRequest(projectId: number | string, mergeRequestIid: number): Promise<any> {
    try {
      const response = await gitlabApi.get(`/projects/${encodeURIComponent(projectId.toString())}/merge_requests/${mergeRequestIid}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching merge request details:', error);
      throw error;
    }
  }

  /**
   * Simple language detection based on file extension
   */
  private detectLanguage(filePath: string): string {
    const extension = filePath.split('.').pop()?.toLowerCase() || '';

    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'rb': 'ruby',
      'java': 'java',
      'go': 'go',
      'php': 'php',
      'cs': 'csharp',
      'cpp': 'cpp',
      'c': 'c',
      'h': 'c',
      'hpp': 'cpp',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'json': 'json',
      'md': 'markdown',
      'yml': 'yaml',
      'yaml': 'yaml',
      'sh': 'shell',
      'bash': 'shell',
      'sql': 'sql',
      'swift': 'swift',
      'kt': 'kotlin',
      'rs': 'rust',
    };

    return languageMap[extension] || 'text';
  }
}

export const gitlabService = new GitLabService();
