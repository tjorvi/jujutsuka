import { $ } from 'execa';
import { match } from 'ts-pattern';

// Helper function to execute jj commands
async function executeJjCommand(repoPath: string, command: string, args: string[]): Promise<void> {
  await $({ cwd: repoPath })`jj ${[command, ...args]}`;
}

// Branded string types for type safety
declare const CommitIdBrand: unique symbol;
declare const ChangeIdBrand: unique symbol;
declare const EmailBrand: unique symbol;
declare const DescriptionBrand: unique symbol;

export type CommitId = string & { readonly [CommitIdBrand]: true };
export type ChangeId = string & { readonly [ChangeIdBrand]: true };
export type Email = string & { readonly [EmailBrand]: true };
export type Description = string & { readonly [DescriptionBrand]: true };

// Transform functions to create branded types
export function createCommitId(value: string): CommitId {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Empty commit ID`);
  }
  if (trimmed.length !== 40) {
    throw new Error(`Invalid commit ID: ${value} (length: ${trimmed.length}, expected 40)`);
  }
  return trimmed as CommitId;
}

export function createChangeId(value: string): ChangeId {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Empty change ID`);
  }
  // Change IDs are typically shorter than commit IDs in jj (usually 12 chars by default)
  if (trimmed.length < 8) {
    throw new Error(`Invalid change ID: ${value} (length: ${trimmed.length}, expected at least 8)`);
  }
  return trimmed as ChangeId;
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
  changeId: ChangeId;
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
 * Expected format: commit_id|change_id|description|author_name|author_email|timestamp|parent_commit_ids
 */
export function parseJjLog(logOutput: string): Commit[] {
  const lines = logOutput.trim().split('\n');
  const commits: Commit[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      throw new Error(`Empty line at index ${i} in jj log output`);
    }
    
    const parts = line.split('|');
    if (parts.length < 7) {
      throw new Error(`Line ${i} has ${parts.length} parts, expected at least 7. Line: "${line}"`);
    }

    const [id, changeId, description, authorName, authorEmail, timestamp, parentsStr] = parts;
    
    // Skip the root commit (all zeros)
    if (id.trim() === '0000000000000000000000000000000000000000') continue;

    const parents = parentsStr ? 
      parentsStr.split(',')
        .filter(p => p.trim() !== '')
        .map(p => createCommitId(p.trim())) : [];

    commits.push({
      id: createCommitId(id),
      changeId: createChangeId(changeId),
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
export async function getRepositoryCommits(repoPath: string): Promise<Commit[]> {
  const template = 'commit_id ++ "|" ++ change_id ++ "|" ++ description.first_line() ++ "|" ++ author.name() ++ "|" ++ author.email() ++ "|" ++ author.timestamp() ++ "|" ++ parents.map(|p| p.commit_id()).join(",") ++ "\\n"';
  const { stdout } = await $({ cwd: repoPath })`jj log --no-graph --template ${template} all()`;

  return parseJjLog(stdout);
}

/**
 * File change information for a commit
 */
export interface FileChange {
  path: string;
  status: 'M' | 'A' | 'D' | 'R' | 'C'; // Modified, Added, Deleted, Renamed, Copied
  additions?: number;
  deletions?: number;
}

// Target types for git operations
export type CommandTarget = {
  type: 'before' | 'after';
  commitId: CommitId;
} | {
  type: 'new-branch';
  fromCommitId: CommitId;
} | {
  type: 'new-commit-between';
  beforeCommitId: CommitId;
  afterCommitId: CommitId;
} | {
  type: 'existing-commit';
  commitId: CommitId;
};

/**
 * Evolution log entry for a commit
 */
export interface EvoLogEntry {
  commitId: CommitId;
  description: Description;
  operationId: string;
  operationDescription: string;
}

/**
 * Get file changes for a specific commit
 */
export async function getCommitFileChanges(repoPath: string, commitId: CommitId): Promise<FileChange[]> {
  try {
    // First get the summary to get proper status
    const { stdout: summaryOutput } = await $({ cwd: repoPath })`jj diff -r ${commitId} --summary`;
    const statusMap = new Map<string, FileChange['status']>();

    const summaryLines = summaryOutput.trim().split('\n');
    for (const line of summaryLines) {
      if (!line.trim()) continue;
      const statusMatch = line.match(/^([MADRC])\s+(.+)$/);
      if (statusMatch) {
        const [, status, path] = statusMatch;
        statusMap.set(path.trim(), status as FileChange['status']);
      }
    }

    // Use jj diff with --stat to get file change information with statistics
    const { stdout } = await $({ cwd: repoPath })`jj diff -r ${commitId} --stat`;
    
    const changes: FileChange[] = [];
    const lines = stdout.trim().split('\n');
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      // Skip the summary line at the end
      if (line.includes('files changed,')) continue;
      
      // Parse the stat format: "path/to/file | 123 ++++++++++++++----"
      const match = line.match(/^(.+?)\s+\|\s+(\d+)\s+([+-]+)$/);
      if (match) {
        const [, path, , plusMinus] = match;
        const additions = (plusMinus.match(/\+/g) || []).length;
        const deletions = (plusMinus.match(/-/g) || []).length;
        const trimmedPath = path.trim();
        const status = statusMap.get(trimmedPath) || 'M';
        
        changes.push({
          path: trimmedPath,
          status,
          additions,
          deletions,
        });
      }
    }
    
    return changes;
  } catch (error) {
    return [];
  }
}

/**
 * Get total statistics for a commit (additions and deletions)
 */
export async function getCommitStats(repoPath: string, commitId: CommitId): Promise<{ additions: number; deletions: number }> {
  try {
    const { stdout } = await $({ cwd: repoPath })`jj diff -r ${commitId} --stat`;
    const lines = stdout.trim().split('\n');
    
    // Find the summary line at the end: "N files changed, X insertions(+), Y deletions(-)"
    const summaryLine = lines[lines.length - 1];
    const match = summaryLine.match(/(\d+)\s+insertions?\(\+\),\s+(\d+)\s+deletions?\(-\)/);
    
    if (match) {
      return {
        additions: parseInt(match[1], 10),
        deletions: parseInt(match[2], 10),
      };
    }
    
    return { additions: 0, deletions: 0 };
  } catch (error) {
    return { additions: 0, deletions: 0 };
  }
}

/**
 * Get evolution log for a specific commit
 */
export async function getCommitEvolog(repoPath: string, commitId: CommitId): Promise<EvoLogEntry[]> {
  try {
    // Use jj evolog with custom template to get parseable output
    const template = 'commit.commit_id() ++ "|" ++ commit.description().first_line() ++ "|" ++ operation.id().short() ++ "|" ++ operation.description() ++ "\\n"';
    const { stdout } = await $({ cwd: repoPath })`jj evolog -r ${commitId} --no-graph --template ${template}`;
    
    const entries: EvoLogEntry[] = [];
    const lines = stdout.trim().split('\n');
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      // Parse the pipe-separated format: commitId|description|operationId|operationDescription
      const parts = line.split('|');
      if (parts.length >= 4) {
        const [fullCommitId, description, operationId, operationDescription] = parts;
        
        try {
          entries.push({
            commitId: createCommitId(fullCommitId.trim()),
            description: createDescription(description.trim()),
            operationId: operationId.trim(),
            operationDescription: operationDescription.trim(),
          });
        } catch (error) {
          // Skip invalid entries
        }
      }
    }
    
    return entries;
  } catch (error) {
    return [];
  }
}

/**
 * Get the diff for a specific file in a commit
 */
export async function getFileDiff(repoPath: string, commitId: CommitId, filePath: string): Promise<string> {
  try {
    // Use jj diff with --git flag to get unified diff format with +/- signs
    const { stdout } = await $({ cwd: repoPath })`jj diff -r ${commitId} --git ${filePath}`;
    return stdout;
  } catch (error) {
    throw new Error(`Failed to get diff for ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
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

      // Stop if this commit has multiple children (branch point)
      if (node.children.length !== 1) {
        break;
      }

      // Continue to the next commit if it has exactly one parent
      // (even if the current commit is a merge, we continue forward if child has 1 parent)
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

  // Log stack graph structure
  console.log('\n📊 Stack Graph:');
  for (const [stackId, stack] of Object.entries(stacks)) {
    const commitDescs = stack.commits.map(cid => {
      const commit = graph[cid]?.commit;
      return commit ? commit.description.substring(0, 40) : cid.substring(0, 8);
    }).join(', ');
    console.log(`  ${stackId}: [${stack.commits.length} commits] ${commitDescs}`);
    if (stack.parentStacks.length > 0) {
      console.log(`    ↑ from: ${stack.parentStacks.join(', ')}`);
    }
    if (stack.childStacks.length > 0) {
      console.log(`    ↓ to: ${stack.childStacks.join(', ')}`);
    }
  }
  console.log('');

  return {
    stacks,
    connections,
    rootStacks,
    leafStacks,
  };
}

/**
 * Command execution functions
 */

export async function executeRebase(repoPath: string, commitId: CommitId, target: CommandTarget): Promise<void> {
  await match(target)
    .with({ type: 'before' }, async (t) => {
      // Move commit before target
      await executeJjCommand(repoPath, 'rebase', ['-r', commitId, '--insert-before', t.commitId]);
    })
    .with({ type: 'after' }, async (t) => {
      // Move commit after target
      await executeJjCommand(repoPath, 'rebase', ['-r', commitId, '--insert-after', t.commitId]);
    })
    .with({ type: 'new-branch' }, async (t) => {
      // Create new branch from specified commit
      await executeJjCommand(repoPath, 'rebase', ['-r', commitId, '--destination', t.fromCommitId]);
    })
    .with({ type: 'new-commit-between' }, async (t) => {
      // Rebase doesn't directly support "between" - this might need special handling
      throw new Error('Rebase to new-commit-between not supported');
    })
    .with({ type: 'existing-commit' }, async (t) => {
      // Rebase onto existing commit (same as 'after')
      await executeJjCommand(repoPath, 'rebase', ['-r', commitId, '--destination', t.commitId]);
    })
    .exhaustive();
}

export async function executeSquash(repoPath: string, sourceCommitId: CommitId, targetCommitId: CommitId): Promise<void> {
  // Squash source commit into target using --from and --into
  await executeJjCommand(repoPath, 'squash', ['--from', sourceCommitId, '--into', targetCommitId]);
}

export async function executeMoveFiles(
  repoPath: string,
  sourceCommitId: CommitId,
  targetCommitId: CommitId,
  files: FileChange[]
): Promise<void> {
  console.log(`📁 Executing move files: ${files.map(f => f.path).join(', ')} from ${sourceCommitId} to ${targetCommitId}`);

  const filePaths = files.map(f => f.path);

  // Use squash with specific file paths to move only those files
  await executeJjCommand(repoPath, 'squash', ['--from', sourceCommitId, '--into', targetCommitId, '--', ...filePaths]);
}

export async function executeSplit(
  repoPath: string,
  sourceCommitId: CommitId,
  files: FileChange[],
  target: CommandTarget
): Promise<void> {
  console.log(`✂️ Executing split: ${sourceCommitId} files: ${files.map(f => f.path).join(', ')} to ${JSON.stringify(target)}`);

  const filePaths = files.map(f => f.path);

  await match(target)
    .with({ type: 'before' }, async (t) => {
      // Split files into a new commit before target
      await executeJjCommand(repoPath, 'split', ['-r', sourceCommitId, '--insert-before', t.commitId, '--', ...filePaths]);
    })
    .with({ type: 'after' }, async (t) => {
      // Split files into a new commit after target
      await executeJjCommand(repoPath, 'split', ['-r', sourceCommitId, '--insert-after', t.commitId, '--', ...filePaths]);
    })
    .with({ type: 'new-commit-between' }, async (t) => {
      // Split files into a new commit between two commits
      // --insert-after means "after" (descendant of) and --insert-before means "before" (ancestor of)
      // To place the split between beforeCommitId and afterCommitId:
      // We want: beforeCommitId → [new split commit] → afterCommitId
      // So: --insert-after beforeCommitId (new commit is after/descendant of beforeCommitId)
      //     --insert-before afterCommitId (new commit is before/ancestor of afterCommitId)

      // However, if afterCommitId is the same as sourceCommitId, we can't use it as --insert-before
      // because that would create a loop. In this case, just use --insert-after beforeCommitId
      if (t.afterCommitId === sourceCommitId) {
        console.log(`⚠️ afterCommitId same as sourceCommitId, using only --insert-after ${t.beforeCommitId}`);
        await executeJjCommand(repoPath, 'split', ['-r', sourceCommitId, '--insert-after', t.beforeCommitId, '--', ...filePaths]);
      } else {
        await executeJjCommand(repoPath, 'split', ['-r', sourceCommitId, '--insert-after', t.beforeCommitId, '--insert-before', t.afterCommitId, '--', ...filePaths]);
      }
    })
    .with({ type: 'existing-commit' }, async (t) => {
      // Split files into an existing commit (use destination)
      await executeJjCommand(repoPath, 'split', ['-r', sourceCommitId, '-d', t.commitId, '--', ...filePaths]);
    })
    .with({ type: 'new-branch' }, async (t) => {
      // Create new branch and split files there
      // This is a two-step process: split, then move to new branch
      await executeJjCommand(repoPath, 'split', ['-r', sourceCommitId, '--', ...filePaths]);
      // TODO: The split creates a new commit, we need to move it to the target branch
      // The exact semantics need clarification for new-branch target
      console.log(`⚠️ new-branch split target needs proper implementation. fromCommitId: ${t.fromCommitId}`);
    })
    .exhaustive();
}