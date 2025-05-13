import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { webhookAuth } from './middleware/webhook-auth.js';
import { apiAuth } from './middleware/api-auth.js';
import { processWebhook } from './controllers/webhook.js';
import { processRepository, getRepositoryStatus } from './controllers/repository.js';
import { searchCode, listProjects } from './controllers/search.js';
import { dbService } from './services/database.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(morgan('dev'));
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Webhook endpoint
app.post('/webhook', webhookAuth, processWebhook);

// API endpoints
// Repository embedding API
app.post('/api/repositories/embed', apiAuth, processRepository);
app.get('/api/repositories/status/:processingId', apiAuth, getRepositoryStatus);

// Code search API
app.post('/api/search', apiAuth, searchCode);
app.get('/api/projects', apiAuth, listProjects);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start the server
async function startServer() {
  try {
    // Connect to the database
    try {
      await dbService.connect();
      console.log('Database connection established');
    } catch (dbError) {
      console.error('Warning: Database connection failed, but continuing:', dbError);
      console.warn('Some features may not work correctly without a database connection');
    }

    app.listen(PORT, () => {
      console.log(`Webhook server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  await dbService.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down server...');
  await dbService.disconnect();
  process.exit(0);
});

// Start the server
startServer().catch(error => {
  console.error("Failed to start webhook server:", error); // This should give a more detailed error
  if (error instanceof Error) {
      console.error("Error name:", error.name);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
  }
  process.exit(1);
});;
