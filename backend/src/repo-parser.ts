import { $ } from 'execa';

// Branded string types for type safety
declare const CommitIdBrand: unique symbol;
declare const EmailBrand: unique symbol;
declare const DescriptionBrand: unique symbol;

export type CommitId = string & { readonly [CommitIdBrand]: true };
export type Email = string & { readonly [EmailBrand]: true };
export type Description = string & { readonly [DescriptionBrand]: true };

// Transform functions to create branded types
export function createCommitId(value: string): CommitId {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length !== 40) {
    throw new Error(`Invalid commit ID: ${value}`);
  }
  return trimmed as CommitId;
}

export function createEmail(value: string): Email {
  const trimmed = value.trim();
  if (!trimmed || !trimmed.includes('@')) {
    throw new Error(`Invalid email: ${value}`);
  }
  return trimmed as Email;
}

export function createDescription(value: string): Description {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Invalid description: ${value}`);
  }
  return trimmed as Description;
}

// Parse timestamp from string to Date
export function parseTimestamp(timestampStr: string): Date {
  const trimmed = timestampStr.trim();
  if (!trimmed) {
    throw new Error(`Invalid timestamp: ${timestampStr}`);
  }
  
  const date = new Date(trimmed);
  if (isNaN(date.getTime())) {
    throw new Error(`Unable to parse timestamp: ${timestampStr}`);
  }
  
  return date;
}

export interface Commit {
  id: CommitId;
  description: Description;
  author: {
    name: string;
    email: Email;
  };
  timestamp: Date;
  parents: CommitId[];
}

/**
 * Parses the output from `jj log` command with the parseable format
 * Expected format: commit_id|description|author_name|author_email|timestamp|parent_commit_ids
 */
export function parseJjLog(logOutput: string): Commit[] {
  const lines = logOutput.trim().split('\n');
  const commits: Commit[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    
    const parts = line.split('|');
    if (parts.length < 6) continue;

    const [id, description, authorName, authorEmail, timestamp, parentsStr] = parts;
    
    // Skip the root commit (all zeros)
    if (id.trim() === '0000000000000000000000000000000000000000') continue;

    try {
      const parents = parentsStr ? 
        parentsStr.split(',')
          .filter(p => p.trim() !== '')
          .map(p => createCommitId(p.trim())) : [];

      commits.push({
        id: createCommitId(id),
        description: createDescription(description),
        author: {
          name: authorName.trim(),
          email: createEmail(authorEmail),
        },
        timestamp: parseTimestamp(timestamp),
        parents,
      });
    } catch (error) {
      console.warn(`Failed to parse commit line: ${line}`, error);
      // Skip malformed commits
      continue;
    }
  }

  return commits;
}

/**
 * Helper function to execute the jj log command and parse its output
 */
export async function getRepositoryCommits(): Promise<Commit[]> {
  try {
    const { stdout } = await $`jj log --no-graph --template ${'commit_id ++ "|" ++ description ++ "|" ++ author.name() ++ "|" ++ author.email() ++ "|" ++ author.timestamp() ++ "|" ++ parents.map(|p| p.commit_id()).join(",") ++ "\\n"'}`;
    
    return parseJjLog(stdout);
  } catch (error) {
    console.error('Failed to get repository commits:', error);
    return [];
  }
}

/**
 * Build a commit graph from the parsed commits
 */
export function buildCommitGraph(commits: Commit[]): Map<CommitId, { commit: Commit; children: CommitId[] }> {
  const graph = new Map<CommitId, { commit: Commit; children: CommitId[] }>();
  
  // Initialize all commits in the graph
  for (const commit of commits) {
    graph.set(commit.id, { commit, children: [] });
  }
  
  // Build parent-child relationships
  for (const commit of commits) {
    for (const parentId of commit.parents) {
      const parent = graph.get(parentId);
      if (parent) {
        parent.children.push(commit.id);
      }
    }
  }
  
  return graph;
}