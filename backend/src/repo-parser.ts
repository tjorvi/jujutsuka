import { $ } from 'execa';
import { match } from 'ts-pattern';
import { join } from 'node:path';
import { watch } from 'node:fs/promises';
import process from 'node:process';

// Helper function to execute jj commands
async function executeJjCommand(repoPath: string, command: string, args: string[]): Promise<void> {
  console.log(`🚀 Executing: jj ${[command, ...args].join(' ')} in ${repoPath}`);
  const t = $({ cwd: repoPath })`jj ${[command, ...args]}`;
  t.stdout.pipe(process.stdout);
  t.stderr.pipe(process.stderr);
  await t;
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
    .with({ type: 'new-commit-between' }, async () => {
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
  await executeJjCommand(repoPath, 'squash', ['-u', '--from', sourceCommitId, '--into', targetCommitId]);
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
  await executeJjCommand(repoPath, 'squash', ['-u', '--from', sourceCommitId, '--into', targetCommitId, '--', ...filePaths]);
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

export async function getDescription(repoPath: string, ref: string): Promise<Description> {
  const { stdout } = await $({ cwd: repoPath })`jj log --no-graph -r ${ref} --template description`;
  return createDescription(stdout);
}

export async function currentOpId(repoPath: string) {
  const { stdout } = await $({ cwd: repoPath })`jj op log -n1 --no-graph -T self.id()`;
  const opId = stdout.trim();
  if (!opId) {
    throw new Error('No current operation');
  }
  return opId;
}

export async function* watchRepoChanges(repoPath: string) {
  const jjPath = join(repoPath, '.jj/repo/op_heads/');

  let lastOpHead = await currentOpId(repoPath);
  const commits = await getRepositoryCommits(repoPath);
  yield { commits, opHead: lastOpHead };
  
  for await (const { filename, eventType } of watch(jjPath, { recursive: true })) {
    console.log(`🛎️ Detected ${eventType} on ${filename} in ${jjPath}`);
    const currentOpHead = await currentOpId(repoPath);
    if (currentOpHead !== lastOpHead) {
      console.log(`🔄 Operation head changed from ${lastOpHead} to ${currentOpHead}`);
      lastOpHead = currentOpHead || '';
      const commits = await getRepositoryCommits(repoPath);
      yield { commits, opHead: lastOpHead };
    } else {
      console.log(`ℹ️ Operation head unchanged (${currentOpHead}), no update emitted`);
    }
  }
}
