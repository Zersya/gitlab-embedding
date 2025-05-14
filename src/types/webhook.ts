// GitLab webhook event types

export interface GitLabUser {
  id: number;
  name: string;
  username: string;
  avatar_url: string;
  email: string;
}

export interface GitLabProject {
  id: number;
  name: string;
  description: string;
  web_url: string;
  avatar_url: string;
  git_ssh_url: string;
  git_http_url: string;
  namespace: string;
  visibility_level: number;
  path_with_namespace: string;
  default_branch: string;
  homepage: string;
  url: string;
  ssh_url: string;
  http_url: string;
}

export interface GitLabRepository {
  name: string;
  url: string;
  description: string;
  homepage: string;
  git_http_url: string;
  git_ssh_url: string;
  visibility_level: number;
}

export interface GitLabCommit {
  id: string;
  message: string;
  title: string;
  timestamp: string;
  url: string;
  author: {
    name: string;
    email: string;
  };
  added: string[];
  modified: string[];
  removed: string[];
}

export interface GitLabPushEvent {
  object_kind: 'push';
  event_name: 'push';
  before: string;
  after: string;
  ref: string;
  checkout_sha: string;
  user_id: number;
  user_name: string;
  user_username: string;
  user_email: string;
  user_avatar: string;
  project_id: number;
  project: GitLabProject;
  repository: GitLabRepository;
  commits: GitLabCommit[];
  total_commits_count: number;
}

export interface GitLabMergeRequestAttributes {
  id: number;
  iid: number;
  target_branch: string;
  source_branch: string;
  source_project_id: number;
  target_project_id: number;
  state: string;
  merge_status: string;
  title: string;
  description: string;
  url: string;
  source: GitLabProject;
  target: GitLabProject;
  last_commit: {
    id: string;
    message: string;
    timestamp: string;
    url: string;
    author: {
      name: string;
      email: string;
    };
  };
  work_in_progress: boolean;
  assignee: GitLabUser;
  assignees: GitLabUser[];
  author: GitLabUser;
  created_at: string;
  updated_at: string;
  action?: string;
}

export interface GitLabMergeRequestEvent {
  object_kind: 'merge_request';
  event_type: string;
  user: GitLabUser;
  project: GitLabProject;
  repository: GitLabRepository;
  object_attributes: GitLabMergeRequestAttributes;
  changes: {
    [key: string]: {
      previous: any;
      current: any;
    };
  };
  labels: any[];
}

export type GitLabWebhookEvent = GitLabPushEvent | GitLabMergeRequestEvent;
