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
    return '(no description)' as Description;
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
  }

  return commits;
}

/**
 * Helper function to execute the jj log command and parse its output
 */
/**
 * Helper function to execute the jj log command and parse its output
 */
export async function getRepositoryCommits(): Promise<Commit[]> {
  const { stdout } = await $`jj log --no-graph --template ${'commit_id ++ "|" ++ description ++ "|" ++ author.name() ++ "|" ++ author.email() ++ "|" ++ author.timestamp() ++ "|" ++ parents.map(|p| p.commit_id()).join(",") ++ "\\n"'}`;
  
  return parseJjLog(stdout);
}

/**
 * Build a commit graph from the parsed commits
 */
export function buildCommitGraph(commits: Commit[]): Record<CommitId, { commit: Commit; children: CommitId[] }> {
  const graph: Record<CommitId, { commit: Commit; children: CommitId[] }> = {};
  
  // Initialize all commits in the graph
  for (const commit of commits) {
    graph[commit.id] = { commit, children: [] };
  }
  
  // Build parent-child relationships
  for (const commit of commits) {
    for (const parentId of commit.parents) {
      const parent = graph[parentId];
      if (parent) {
        parent.children.push(commit.id);
      }
    }
  }
  
  return graph;
}

// Branded string type for stack IDs
declare const StackIdBrand: unique symbol;
export type StackId = string & { readonly [StackIdBrand]: true };

export function createStackId(value: string): StackId {
  return value as StackId;
}

/**
 * Represents a linear sequence of commits (no branching/merging within the stack)
 */
export interface Stack {
  id: StackId;
  commits: CommitId[];  // Ordered from oldest (bottom) to newest (top)
  parentStacks: StackId[];  // Stacks that this stack depends on
  childStacks: StackId[];   // Stacks that depend on this stack
}

/**
 * Information about connections between stacks
 */
export interface StackConnection {
  from: StackId;
  to: StackId;
  type: 'linear' | 'merge' | 'branch';
}

/**
 * Result of stack preprocessing
 */
export interface StackGraph {
  stacks: Record<StackId, Stack>;
  connections: StackConnection[];
  rootStacks: StackId[];  // Stacks with no parents
  leafStacks: StackId[];  // Stacks with no children
}

/**
 * Preprocess commits into stacks (linear chains) and their connections
 */
export function buildStackGraph(commits: Commit[]): StackGraph {
  const graph = buildCommitGraph(commits);
  const commitToStack = new Map<CommitId, StackId>();
  const stacks: Record<StackId, Stack> = {};
  const visited = new Set<CommitId>();
  let stackCounter = 0;

  // Helper to create a new stack ID
  function nextStackId(): StackId {
    return createStackId(`stack-${stackCounter++}`);
  }

  // Build linear chains by starting from each unvisited commit and walking forward
  function buildLinearChain(startCommitId: CommitId): void {
    if (visited.has(startCommitId)) return;

    const stackId = nextStackId();
    const chainCommits: CommitId[] = [];
    let currentId = startCommitId;

    // Walk forward through the linear chain
    while (currentId && !visited.has(currentId)) {
      const node = graph[currentId];
      if (!node) break;

      chainCommits.push(currentId);
      visited.add(currentId);
      commitToStack.set(currentId, stackId);

      // Stop if this commit has multiple children (branch point) or multiple parents (merge point)
      if (node.children.length !== 1 || node.commit.parents.length > 1) {
        break;
      }

      // Continue to the next commit if it has exactly one parent (us)
      const nextId = node.children[0];
      const nextNode = graph[nextId];
      if (!nextNode || nextNode.commit.parents.length !== 1) {
        break;
      }

      currentId = nextId;
    }

    // Create the stack
    stacks[stackId] = {
      id: stackId,
      commits: chainCommits,
      parentStacks: [],
      childStacks: [],
    };
  }

  // Process all commits starting from roots
  const allCommitIds = Object.keys(graph) as CommitId[];
  
  // Sort commits by timestamp to ensure consistent ordering
  const sortedCommitIds = allCommitIds.sort((a, b) => 
    graph[a].commit.timestamp.getTime() - graph[b].commit.timestamp.getTime()
  );

  // Build stacks starting from oldest commits
  for (const commitId of sortedCommitIds) {
    buildLinearChain(commitId);
  }

  // Now build connections between stacks
  const connections: StackConnection[] = [];
  const stackConnections = new Set<string>(); // To avoid duplicates

  for (const stack of Object.values(stacks)) {
    // Get the top (newest) commit of this stack
    const topCommit = stack.commits[stack.commits.length - 1];
    const { children } = graph[topCommit];

    for (const childCommitId of children) {
      const childStackId = commitToStack.get(childCommitId);
      if (childStackId && childStackId !== stack.id) {
        const connectionKey = `${stack.id}->${childStackId}`;
        if (!stackConnections.has(connectionKey)) {
          stackConnections.add(connectionKey);
          
          // Determine connection type
          const childStack = stacks[childStackId];
          const bottomChildCommit = childStack.commits[0];
          const { commit: childCommit } = graph[bottomChildCommit];
          
          const connectionType: StackConnection['type'] = 
            childCommit.parents.length > 1 ? 'merge' :
            children.length > 1 ? 'branch' : 'linear';

          connections.push({
            from: stack.id,
            to: childStackId,
            type: connectionType,
          });

          // Update parent/child relationships
          stack.childStacks.push(childStackId);
          childStack.parentStacks.push(stack.id);
        }
      }
    }
  }

  // Find root and leaf stacks
  const rootStacks = Object.values(stacks)
    .filter(stack => stack.parentStacks.length === 0)
    .map(stack => stack.id);
    
  const leafStacks = Object.values(stacks)
    .filter(stack => stack.childStacks.length === 0)
    .map(stack => stack.id);

  return {
    stacks,
    connections,
    rootStacks,
    leafStacks,
  };
}