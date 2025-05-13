import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

if (!WEBHOOK_SECRET) {
  console.warn('WEBHOOK_SECRET is not set. Webhook authentication will be disabled.');
}

/**
 * Middleware to authenticate GitLab webhook requests
 *
 * GitLab sends a X-Gitlab-Token header with the webhook secret
 * This middleware verifies that the token matches our configured secret
 */
export const webhookAuth = (req: Request, res: Response, next: NextFunction): void => {
  // Skip authentication if webhook secret is not configured
  if (!WEBHOOK_SECRET) {
    console.warn('Webhook authentication skipped: WEBHOOK_SECRET not configured');
    next();
    return;
  }

  const token = req.headers['x-gitlab-token'];

  if (!token) {
    console.error('Webhook authentication failed: Missing X-Gitlab-Token header');
    res.status(401).json({ error: 'Unauthorized: Missing authentication token' });
    return;
  }

  if (token !== WEBHOOK_SECRET) {
    console.error('Webhook authentication failed: Invalid token');
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
    return;
  }

  next();
};

/**
 * Alternative authentication method using HMAC signature verification
 * This is more secure but requires additional configuration in GitLab
 */
export const webhookHmacAuth = (req: Request, res: Response, next: NextFunction): void => {
  // Skip authentication if webhook secret is not configured
  if (!WEBHOOK_SECRET) {
    console.warn('Webhook HMAC authentication skipped: WEBHOOK_SECRET not configured');
    next();
    return;
  }

  const signature = req.headers['x-gitlab-hmac-sha256'];

  if (!signature) {
    console.error('Webhook HMAC authentication failed: Missing X-Gitlab-HMAC-SHA256 header');
    res.status(401).json({ error: 'Unauthorized: Missing signature' });
    return;
  }

  // Get raw body from the request
  const rawBody = req.body ? JSON.stringify(req.body) : '';

  // Calculate expected signature
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  hmac.update(rawBody);
  const calculatedSignature = hmac.digest('hex');

  if (signature !== calculatedSignature) {
    console.error('Webhook HMAC authentication failed: Invalid signature');
    res.status(401).json({ error: 'Unauthorized: Invalid signature' });
    return;
  }

  next();
};
