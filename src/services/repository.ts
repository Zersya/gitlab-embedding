import axios from 'axios';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import util from 'util';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { CodeFile } from '../models/embedding.js';
import { gitlabService } from './gitlab.js';

dotenv.config();

const execPromise = util.promisify(exec);
const TEMP_DIR = process.env.TEMP_DIR || './temp';
const GITLAB_API_URL = process.env.GITLAB_API_URL || 'https://gitlab.com/api/v4';

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

export class RepositoryService {
  /**
   * Extract project ID from GitLab repository URL
   */
  extractProjectId(repositoryUrl: string): string | null {
    try {
      // Handle URLs like https://gitlab.com/namespace/project
      const url = new URL(repositoryUrl);

      // Remove leading and trailing slashes from pathname
      const pathname = url.pathname.replace(/^\/|\/$/g, '');

      // For GitLab instances, the project ID is the URL-encoded path with namespace
      if (pathname) {
        console.log(`Extracted project path: ${pathname} from URL: ${repositoryUrl}`);
        return pathname;
      }

      return null;
    } catch (error) {
      console.error('Error extracting project ID:', error);
      return null;
    }
  }

  /**
   * Clone a repository from GitLab
   */
  async cloneRepository(repositoryUrl: string): Promise<{ repoPath: string, projectId: string | null }> {
    const repoId = uuidv4();
    const repoPath = path.join(TEMP_DIR, repoId);

    try {
      // Extract project ID from URL
      const projectId = this.extractProjectId(repositoryUrl);

      if (!projectId) {
        throw new Error('Could not extract project ID from repository URL');
      }

      // Create directory for the repository
      fs.mkdirSync(repoPath, { recursive: true });

      // Clone the repository using the GitLab API token for authentication
      const gitlabToken = process.env.GITLAB_API_TOKEN;
      if (!gitlabToken) {
        throw new Error('GITLAB_API_TOKEN is not set');
      }

      // Construct the clone URL with authentication
      const cloneUrl = repositoryUrl.replace('https://', `https://oauth2:${gitlabToken}@`);

      // Clone the repository
      console.log(`Cloning repository ${repositoryUrl} to ${repoPath}`);
      await execPromise(`git clone ${cloneUrl} ${repoPath}`);

      return { repoPath, projectId };
    } catch (error) {
      console.error('Error cloning repository:', error);
      // Clean up if there was an error
      if (fs.existsSync(repoPath)) {
        fs.rmSync(repoPath, { recursive: true, force: true });
      }
      throw error;
    }
  }

  /**
   * Get all files from a local repository
   */
  async getFilesFromLocalRepo(repoPath: string): Promise<CodeFile[]> {
    try {
      const files: CodeFile[] = [];

      // Get all files recursively
      const getFilesRecursively = (dir: string, baseDir: string = repoPath) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(baseDir, fullPath);

          // Skip .git directory and node_modules
          if (entry.name === '.git' || entry.name === 'node_modules') {
            continue;
          }

          if (entry.isDirectory()) {
            getFilesRecursively(fullPath, baseDir);
          } else {
            try {
              // Skip binary files and very large files
              const stats = fs.statSync(fullPath);
              if (stats.size > 1000000) { // Skip files larger than 1MB
                continue;
              }

              const content = fs.readFileSync(fullPath, 'utf-8');
              const language = this.detectLanguage(relativePath);

              files.push({
                path: relativePath,
                content,
                language,
                lastModified: stats.mtime,
              });
            } catch (error) {
              console.error(`Error reading file ${fullPath}:`, error);
            }
          }
        }
      };

      getFilesRecursively(repoPath);
      return files;
    } catch (error) {
      console.error('Error getting files from local repository:', error);
      throw error;
    }
  }

  /**
   * Detect programming language from file extension
   */
  detectLanguage(filePath: string): string {
    const extension = path.extname(filePath).toLowerCase();

    const languageMap: Record<string, string> = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.rb': 'ruby',
      '.java': 'java',
      '.c': 'c',
      '.cpp': 'cpp',
      '.cs': 'csharp',
      '.go': 'go',
      '.php': 'php',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.json': 'json',
      '.md': 'markdown',
      '.sql': 'sql',
      '.sh': 'shell',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.xml': 'xml',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.rs': 'rust',
    };

    return languageMap[extension] || 'plaintext';
  }

  /**
   * Clean up temporary repository
   */
  cleanupRepository(repoPath: string): void {
    try {
      if (fs.existsSync(repoPath)) {
        fs.rmSync(repoPath, { recursive: true, force: true });
      }
    } catch (error) {
      console.error('Error cleaning up repository:', error);
    }
  }
}

export const repositoryService = new RepositoryService();
