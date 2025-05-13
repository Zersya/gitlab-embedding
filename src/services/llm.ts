import axios from 'axios';
import dotenv from 'dotenv';
import { CodeEmbedding } from '../models/embedding.js';

dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_API_URL = process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1';

if (!OPENROUTER_API_KEY) {
  console.warn('OPENROUTER_API_KEY is not set. LLM analysis will not be available.');
}

const openRouterApi = axios.create({
  baseURL: OPENROUTER_API_URL,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
    'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000', // Required by OpenRouter
  },
});

export class LlmService {
  /**
   * Analyze code snippets using an LLM through OpenRouter
   */
  async analyzeCode(query: string, codeSnippets: CodeEmbedding[], model: string = 'anthropic/claude-3-opus-20240229'): Promise<string> {
    try {
      if (!OPENROUTER_API_KEY) {
        return 'LLM analysis is not available. OPENROUTER_API_KEY is not set.';
      }

      // Format code snippets for the prompt
      const formattedSnippets = codeSnippets.map((snippet, index) => {
        return `
Code Snippet ${index + 1} (${snippet.filePath}, Language: ${snippet.language}):
\`\`\`${snippet.language}
${snippet.content.slice(0, 2000)}${snippet.content.length > 2000 ? '...' : ''}
\`\`\`
`;
      }).join('\n');

      // Create the prompt
      const prompt = `
You are a code analysis assistant. I'm searching for code related to the following query:

Query: ${query}

I've found the following code snippets that might be relevant:

${formattedSnippets}

Please analyze these code snippets and provide a comprehensive review that:
1. Explains how the code relates to my query
2. Summarizes the key functionality and purpose of each snippet
3. Highlights any important patterns, algorithms, or techniques used
4. Identifies any potential issues, bugs, or areas for improvement
5. Suggests how I might use or adapt this code for my needs

Focus on being thorough but concise, and prioritize the most relevant aspects of the code to my query.
`;

      // Call the OpenRouter API
      const response = await openRouterApi.post('/chat/completions', {
        model,
        messages: [
          { role: 'system', content: 'You are a helpful code analysis assistant.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 2000,
      });

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('Error analyzing code with LLM:', error);
      return `Error analyzing code: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

export const llmService = new LlmService();
