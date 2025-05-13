# GitLab Webhook Integration with Qodo-Embed-1

A webhook integration that listens for GitLab repository events, fetches code, generates embeddings using Qodo-Embed-1, and stores them for later retrieval and search.

## Features

- **Webhook Integration**: Listens for GitLab push and merge request events
- **Code Fetching**: Retrieves all code from the repository, not just diffs
- **Embedding Generation**: Uses Qodo-Embed-1 model to generate embeddings for code
- **Database Storage**: Stores embeddings in PostgreSQL database for later retrieval and search
- **Security**: Implements webhook authentication and validation

## Prerequisites

- Node.js 18+
- PostgreSQL database (with pgvector extension for vector search)
- GitLab account with API access
- Qodo-Embed-1 API access

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/repopo-reviewer-hooks.git
   cd repopo-reviewer-hooks
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file based on the `.env.example`:
   ```bash
   cp .env.example .env
   ```

4. Fill in the environment variables in the `.env` file:
   ```
   # GitLab API Configuration
   GITLAB_API_TOKEN='your-gitlab-api-token'
   GITLAB_API_URL='https://gitlab.com/api/v4'
   GITLAB_USERNAME='your-gitlab-username'

   # Webhook Configuration
   WEBHOOK_SECRET='your-webhook-secret'
   PORT=3000

   # Database Configuration
   DATABASE_URL='postgresql://postgres:postgres@localhost:5432/repopo_reviewer'

   # Embedding Configuration
   QODO_EMBED_API_KEY='your-qodo-embed-api-key'
   QODO_EMBED_API_URL='https://api.qodo.ai/v1/embeddings'
   ```

5. Build the project:
   ```bash
   npm run build
   ```

## Usage

### Starting the Webhook Server

```bash
npm run start:webhook
```

The webhook server will start on the port specified in the `.env` file (default: 3000).

### Setting Up GitLab Webhook

1. Go to your GitLab project
2. Navigate to Settings > Webhooks
3. Add a new webhook with the following settings:
   - URL: `https://your-server.com/webhook`
   - Secret Token: The same value as `WEBHOOK_SECRET` in your `.env` file
   - Trigger events:
     - Push events
     - Merge request events
   - SSL verification: Enabled (recommended for production)

4. Click "Add webhook"

### Testing the Webhook

1. Make a push to your GitLab repository
2. Check the logs of your webhook server to see if the event was received and processed
3. Verify that the embeddings were generated and stored in the database

## Database Schema

The PostgreSQL database contains the following tables:

### `embeddings`

Stores the embeddings for each file in the repository.

```sql
CREATE TABLE embeddings (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL,
  repository_url TEXT,
  file_path TEXT NOT NULL,
  content TEXT,
  embedding vector(1536), -- Uses pgvector extension
  language TEXT,
  commit_id TEXT NOT NULL,
  branch TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(project_id, file_path)
)
```

### `projects`

Stores metadata about each project.

```sql
CREATE TABLE projects (
  project_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  url TEXT,
  default_branch TEXT,
  last_processed_commit TEXT,
  last_processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
```

### `batches`

Stores information about each batch of embeddings generated.

```sql
CREATE TABLE batches (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL,
  commit_id TEXT NOT NULL,
  branch TEXT,
  files JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
```

### Vector Search

The system uses the `pgvector` extension for PostgreSQL to enable efficient similarity search of code embeddings. If the extension is not available, it will fall back to storing embeddings as JSONB and using basic filtering.

## Next Steps

1. **Configure GitLab Webhook**: Set up a webhook in your GitLab project pointing to your server's `/webhook` endpoint
2. **Set Up PostgreSQL**: Install and configure PostgreSQL for storing the embeddings. For vector search capabilities, install the pgvector extension
3. **Get API Keys**: Obtain API keys for GitLab and Qodo-Embed-1
4. **Test the Integration**: Make a push to your repository and verify that embeddings are generated and stored

## Security Considerations

- The webhook endpoint is protected by a secret token
- The GitLab API token should have read-only access to repositories
- The Qodo-Embed-1 API key should be kept secure
- For production deployments, use HTTPS for the webhook endpoint

## License

MIT
