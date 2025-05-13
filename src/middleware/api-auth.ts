import { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.warn('API_KEY is not set. API authentication will be disabled.');
}

/**
 * Middleware to authenticate API requests
 * 
 * Clients should send an X-API-Key header with the API key
 * This middleware verifies that the token matches our configured API key
 */
export const apiAuth = (req: Request, res: Response, next: NextFunction): void => {
  // Skip authentication if API key is not configured
  if (!API_KEY) {
    console.warn('API authentication skipped: API_KEY not configured');
    next();
    return;
  }

  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    console.error('API authentication failed: Missing X-API-Key header');
    res.status(401).json({ error: 'Unauthorized: Missing API key' });
    return;
  }

  if (apiKey !== API_KEY) {
    console.error('API authentication failed: Invalid API key');
    res.status(401).json({ error: 'Unauthorized: Invalid API key' });
    return;
  }

  next();
};
