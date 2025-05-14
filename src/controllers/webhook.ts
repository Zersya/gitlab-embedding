import { Request, Response } from 'express';
import { GitLabPushEvent, GitLabMergeRequestEvent, GitLabWebhookEvent } from '../types/webhook.js';
import { gitlabService } from '../services/gitlab.js';
import { embeddingService } from '../services/embedding.js';
import { dbService } from '../services/database.js';
import { CodeFile, EmbeddingBatch, ProjectMetadata } from '../models/embedding.js';

/**
 * Process a GitLab webhook event
 */
export const processWebhook = async (req: Request, res: Response, next: Function) => {
  try {
    const event: GitLabWebhookEvent = req.body;

    console.log(`Received webhook event: ${event.object_kind}`);

    // Acknowledge receipt of the webhook immediately
    res.status(202).json({ message: 'Webhook received and processing started' });

    // Process the event asynchronously
    if (event.object_kind === 'push') {
      await processPushEvent(event);
    } else if (event.object_kind === 'merge_request') {
      await processMergeRequestEvent(event);
    } else {
      console.log(`Ignoring unsupported event type`);
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
    // We've already sent a response, so we just log the error
  }
};

/**
 * Process a push event
 */
async function processPushEvent(event: GitLabPushEvent) {
  try {
    // Skip if this is a branch deletion
    if (event.after === '0000000000000000000000000000000000000000') {
      console.log('Skipping branch deletion event');
      return;
    }

    const projectId = event.project_id;
    const commitId = event.after;
    const branch = event.ref.replace('refs/heads/', '');

    console.log(`Processing push event for project ${projectId}, commit ${commitId}, branch ${branch}`);

    // Get project metadata
    let projectMetadata = await dbService.getProjectMetadata(projectId);

    if (!projectMetadata) {
      const projectDetails = await gitlabService.getProject(projectId);

      projectMetadata = {
        projectId,
        name: projectDetails.name,
        description: projectDetails.description || '',
        url: projectDetails.web_url,
        defaultBranch: projectDetails.default_branch,
        lastProcessedCommit: '',
        lastProcessedAt: new Date(),
      };
    }

    // Skip if we've already processed this commit
    if (projectMetadata.lastProcessedCommit === commitId) {
      console.log(`Commit ${commitId} already processed, skipping`);
      return;
    }

    // Get all files from the repository at this commit
    console.log(`Fetching files for project ${projectId} at commit ${commitId}`);
    const files = await gitlabService.getAllFiles(projectId, commitId);

    if (files.length === 0) {
      console.log('No files found, skipping');
      return;
    }

    console.log(`Found ${files.length} files, generating embeddings`);

    // Generate embeddings for all files
    const embeddings = await embeddingService.generateEmbeddings(
      files,
      projectId,
      commitId,
      branch
    );

    // Add repository URL to embeddings
    const repositoryUrl = event.project.web_url;
    embeddings.forEach(embedding => {
      embedding.repositoryUrl = repositoryUrl;
    });

    console.log(`Generated ${embeddings.length} embeddings, saving to database`);

    // Save embeddings to database
    await dbService.saveEmbeddings(embeddings);

    // Save batch information
    const batch: EmbeddingBatch = {
      projectId,
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

    console.log(`Successfully processed push event for project ${projectId}, commit ${commitId}`);
  } catch (error) {
    console.error('Error processing push event:', error);
  }
}

/**
 * Process a merge request event
 */
async function processMergeRequestEvent(event: GitLabMergeRequestEvent) {
  try {
    // Only process merge requests that are opened or updated
    if (!['open', 'update'].includes(event.object_attributes.action || '')) {
      console.log(`Skipping merge request event with action: ${event.object_attributes.action}`);
      return;
    }

    const projectId = event.project.id;
    const mergeRequestIid = event.object_attributes.iid;
    const sourceBranch = event.object_attributes.source_branch;
    const commitId = event.object_attributes.last_commit.id;

    console.log(`Processing merge request event for project ${projectId}, MR !${mergeRequestIid}, commit ${commitId}`);

    // Get project metadata
    let projectMetadata = await dbService.getProjectMetadata(projectId);

    if (!projectMetadata) {
      const projectDetails = await gitlabService.getProject(projectId);

      projectMetadata = {
        projectId,
        name: projectDetails.name,
        description: projectDetails.description || '',
        url: projectDetails.web_url,
        defaultBranch: projectDetails.default_branch,
        lastProcessedCommit: '',
        lastProcessedAt: new Date(),
      };
    }

    // Get all files from the source branch
    console.log(`Fetching files for project ${projectId} at branch ${sourceBranch}`);
    const files = await gitlabService.getAllFiles(projectId, sourceBranch);

    if (files.length === 0) {
      console.log('No files found, skipping');
      return;
    }

    console.log(`Found ${files.length} files, generating embeddings`);

    // Generate embeddings for all files
    const embeddings = await embeddingService.generateEmbeddings(
      files,
      projectId,
      commitId,
      sourceBranch
    );

    // Add repository URL to embeddings
    const repositoryUrl = event.project.web_url;
    embeddings.forEach(embedding => {
      embedding.repositoryUrl = repositoryUrl;
    });

    console.log(`Generated ${embeddings.length} embeddings, saving to database`);

    // Save embeddings to database
    await dbService.saveEmbeddings(embeddings);

    // Save batch information
    const batch: EmbeddingBatch = {
      projectId,
      commitId,
      branch: sourceBranch,
      files,
      embeddings,
      createdAt: new Date(),
    };

    await dbService.saveBatch(batch);

    // Update project metadata
    projectMetadata.lastProcessedCommit = commitId;
    projectMetadata.lastProcessedAt = new Date();
    await dbService.updateProjectMetadata(projectMetadata);

    console.log(`Successfully processed merge request event for project ${projectId}, MR !${mergeRequestIid}`);
  } catch (error) {
    console.error('Error processing merge request event:', error);
  }
}
