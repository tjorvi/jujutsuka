import { $ } from 'execa';
import { match } from 'ts-pattern';
import { join } from 'node:path';
import { watch, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { AsyncLocalStorage } from 'node:async_hooks';

type AsyncTask<T> = () => Promise<T>;

class RepoExecutionQueue {
  private tail: Promise<void> = Promise.resolve();

  enqueue<T>(task: AsyncTask<T>): Promise<T> {
    const resultPromise = this.tail.then(() => task());
    this.tail = resultPromise.then(
      () => undefined,
      () => undefined
    );
    return resultPromise;
  }
}

const repoExecutionQueues = new Map<string, RepoExecutionQueue>();
const repoExecutionContext = new AsyncLocalStorage<Set<string>>();

function getRepoExecutionQueue(repoPath: string): RepoExecutionQueue {
  let queue = repoExecutionQueues.get(repoPath);
  if (!queue) {
    queue = new RepoExecutionQueue();
    repoExecutionQueues.set(repoPath, queue);
  }
  return queue;
}

async function runWithRepoExclusive<T>(repoPath: string, task: AsyncTask<T>): Promise<T> {
  const currentContext = repoExecutionContext.getStore();
  if (currentContext?.has(repoPath)) {
    return task();
  }

  const queue = getRepoExecutionQueue(repoPath);
  return queue.enqueue(async () => {
    const nextContext = new Set(currentContext ?? []);
    nextContext.add(repoPath);
    return repoExecutionContext.run(nextContext, task);
  });
}

// Helper function to execute jj commands
async function executeJjCommand(repoPath: string, command: string, args: string[]): Promise<void> {
  await runWithRepoExclusive(repoPath, async () => {
    console.log(`🚀 Executing: jj ${[command, ...args].join(' ')} in ${repoPath}`);
    const env = {
      ...process.env,
      JJ_EDITOR: process.env.JJ_EDITOR ?? 'true',
      JJ_UI: process.env.JJ_UI ?? 'text',
      EDITOR: process.env.EDITOR ?? 'true',
      VISUAL: process.env.VISUAL ?? process.env.EDITOR ?? 'true',
      GIT_EDITOR: process.env.GIT_EDITOR ?? 'true',
    };
    const t = $({ cwd: repoPath, env })`jj ${[command, ...args]}`;
    t.stdout.pipe(process.stdout);
    t.stderr.pipe(process.stderr);
    await t;
  });
}

// Branded string types for type safety
declare const CommitIdBrand: unique symbol;
declare const ChangeIdBrand: unique symbol;
declare const EmailBrand: unique symbol;
declare const DescriptionBrand: unique symbol;
declare const BookmarkNameBrand: unique symbol;

export type CommitId = string & { readonly [CommitIdBrand]: true };
export type ChangeId = string & { readonly [ChangeIdBrand]: true };
export type Email = string & { readonly [EmailBrand]: true };
export type Description = string & { readonly [DescriptionBrand]: true };
export type BookmarkName = string & { readonly [BookmarkNameBrand]: true };

export interface Bookmark {
  name: BookmarkName;
  commitId: CommitId;
}

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

export function createBookmarkName(value: string): BookmarkName {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Invalid bookmark name: "${value}"`);
  }
  return trimmed as BookmarkName;
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
  hasConflicts: boolean;
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

    const [id, changeId, description, authorName, authorEmail, timestamp, parentsStr, conflictStr] = parts;
    
    // Skip the root commit (all zeros)
    if (id.trim() === '0000000000000000000000000000000000000000') continue;

    const parents = parentsStr ? 
      parentsStr.split(',')
        .filter(p => p.trim() !== '')
        .map(p => createCommitId(p.trim())) : [];

    const hasConflicts = conflictStr ? conflictStr.trim().toLowerCase() === 'true' : false;

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
      hasConflicts,
    });
  }

  return commits;
}

/**
 * Helper function to execute the jj log command and parse its output
 */
export async function getRepositoryCommits(repoPath: string, revset: string): Promise<Commit[]> {
  return runWithRepoExclusive(repoPath, async () => {
    const template = 'commit_id ++ "|" ++ change_id ++ "|" ++ description.first_line() ++ "|" ++ author.name() ++ "|" ++ author.email() ++ "|" ++ author.timestamp() ++ "|" ++ parents.map(|p| p.commit_id()).join(",") ++ "|" ++ if(conflict, "true", "false") ++ "\\n"';
    console.log(`📥 Fetching repository commits from ${repoPath}`);
    console.log(`🔧 Using template: ${template}`);
    const escapedTemplateForSingleQuotes = template.replace(/'/g, `'\"'\"'`);
    console.log(`📝 Equivalent shell command:\njj log -r ${revset} --ignore-working-copy --no-graph --template '${escapedTemplateForSingleQuotes}'`);
    const { stdout } = await $({ cwd: repoPath })`jj log -r ${revset} --no-graph --template ${template}`;
    console.log('📜 Raw jj log output:\n', stdout);

    return parseJjLog(stdout);
  });
}

/**
 * Determine the commit that is currently checked out in the workspace.
 */
async function resolveCommitId(repoPath: string, rev: string): Promise<CommitId | null> {
  const { stdout } = await $({ cwd: repoPath })`jj log --no-graph -r ${rev} --template commit_id`;
  const commitId = stdout.trim();

  if (commitId === '' || commitId === '0000000000000000000000000000000000000000') {
    return null;
  }

  return createCommitId(commitId);
}

export async function getCurrentCommitId(repoPath: string): Promise<CommitId | null> {
  return runWithRepoExclusive(repoPath, async () => resolveCommitId(repoPath, '@'));
}

export async function getGitHeadCommitId(repoPath: string): Promise<CommitId | null> {
  return runWithRepoExclusive(repoPath, async () => resolveCommitId(repoPath, 'git_head()'));
}

/**
 * Fetch all bookmarks in the repository
 */
export async function getBookmarks(repoPath: string): Promise<Bookmark[]> {
  return runWithRepoExclusive(repoPath, async () => {
    if (!repoPath) {
      return [];
    }

    try {
      const { stdout } = await $({ cwd: repoPath })`jj bookmark list`;
      const raw = stdout.trim();
      if (raw === '') {
        return [];
      }

      const seen = new Set<string>();
      const bookmarks: Bookmark[] = [];

      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
          continue;
        }

        const firstToken = trimmed.split(/\s+/)[0] ?? '';
        if (!firstToken) {
          continue;
        }

        const nameCandidate = firstToken.replace(/:+$/, '');
        if (!nameCandidate) {
          continue;
        }

        let commitId: CommitId | null = null;
        const hexMatch = trimmed.match(/[0-9a-f]{6,40}/i);
        if (hexMatch) {
          try {
            commitId = await resolveCommitId(repoPath, hexMatch[0]);
          } catch (hexError) {
            console.warn(`Failed to resolve bookmark ${nameCandidate} via hex ${hexMatch[0]}:`, hexError);
          }
        }

        if (!commitId) {
          try {
            commitId = await resolveCommitId(repoPath, nameCandidate);
          } catch (nameError) {
            console.warn(`Failed to resolve bookmark ${nameCandidate} via name:`, nameError);
            continue;
          }
        }

        if (!commitId) {
          continue;
        }

        try {
          const bookmarkName = createBookmarkName(nameCandidate);
          const key = `${bookmarkName}|${commitId}`;
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          bookmarks.push({ name: bookmarkName, commitId });
        } catch (parseError) {
          console.warn(`Skipping bookmark ${nameCandidate} due to parse error:`, parseError);
        }
      }

      console.log('🔖 Parsed bookmarks (list only):', bookmarks.map(b => `${b.name}:${b.commitId}`).join(', ') || '(none)');
      return bookmarks;
    } catch (error) {
      console.error('Failed to read bookmarks from repository:', error);
      return [];
    }
  });
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

/**
 * Position type used throughout the application from UI to jj command execution.
 * Represents a location where an operation should occur - the command context
 * determines what actually happens at this position.
 */
export type Position =
  | {
      kind: 'before';
      commit: CommitId;
    }
  | {
      kind: 'after';
      commit: CommitId;
    }
  | {
      kind: 'between-commits';
      beforeCommit: CommitId;
      afterCommit: CommitId;
    }
  | {
      kind: 'new-branch';
      commit: CommitId;
    }
  | {
      kind: 'existing-commit';
      commit: CommitId;
    };

// Legacy alias for compatibility during migration
export type CommandTarget = Position;

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
 * Operation log entry
 */
export interface OpLogEntry {
  operationId: string;
  fullOperationId: string;
  operationDescription: string;
  timestamp: string;
  user: string;
}

/**
 * Get file changes for a specific commit
 */
export async function getCommitFileChanges(repoPath: string, commitId: CommitId): Promise<FileChange[]> {
  return runWithRepoExclusive(repoPath, async () => {
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
          // Validate status is one of the expected values
          if (status === 'M' || status === 'A' || status === 'D' || status === 'R' || status === 'C') {
            statusMap.set(path.trim(), status);
          } else {
            console.warn(`Unexpected file status: ${status} for path: ${path}`);
          }
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
  });
}

/**
 * Get total statistics for a commit (additions and deletions)
 */
export async function getCommitStats(repoPath: string, commitId: CommitId): Promise<{ additions: number; deletions: number }> {
  return runWithRepoExclusive(repoPath, async () => {
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
  });
}

/**
 * Get evolution log for a specific commit
 */
export async function getCommitEvolog(repoPath: string, commitId: CommitId): Promise<EvoLogEntry[]> {
  return runWithRepoExclusive(repoPath, async () => {
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
  });
}

/**
 * Get the diff for a specific file in a commit
 */
export async function getFileDiff(repoPath: string, commitId: CommitId, filePath: string): Promise<string> {
  return runWithRepoExclusive(repoPath, async () => {
    try {
      // Use jj diff with --git flag to get unified diff format with +/- signs
      const { stdout } = await $({ cwd: repoPath })`jj diff -r ${commitId} --git ${filePath}`;
      return stdout;
    } catch (error) {
      throw new Error(`Failed to get diff for ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

/**
 * Hunk range specification for splitting commits by line ranges
 */
export interface HunkRange {
  filePath: string;
  startLine: number; // 1-indexed, inclusive
  endLine: number;   // 1-indexed, inclusive
}

/**
 * Parse a hunk range string in the format "path:start-end"
 */
export function parseHunkRange(rangeStr: string): HunkRange {
  const parts = rangeStr.split(':');
  if (parts.length < 2) {
    throw new Error(`Invalid hunk range format: ${rangeStr}. Expected format: path:start-end`);
  }

  // Handle paths with colons (like Windows paths C:\...)
  const rangePart = parts[parts.length - 1];
  const filePath = parts.slice(0, -1).join(':');

  const lineNumbers = rangePart.split('-');
  if (lineNumbers.length !== 2) {
    throw new Error(`Invalid line range format: ${rangePart}. Expected format: start-end`);
  }

  const startLine = parseInt(lineNumbers[0], 10);
  const endLine = parseInt(lineNumbers[1], 10);

  if (isNaN(startLine) || isNaN(endLine)) {
    throw new Error(`Invalid line numbers in range: ${rangePart}`);
  }

  if (startLine < 1 || endLine < 1) {
    throw new Error(`Line numbers must be >= 1, got: ${startLine}-${endLine}`);
  }

  if (startLine > endLine) {
    throw new Error(`Start line must be <= end line, got: ${startLine}-${endLine}`);
  }

  return { filePath, startLine, endLine };
}

/**
 * Get file content from a specific commit
 */
export async function getFileContent(repoPath: string, commitId: CommitId, filePath: string): Promise<string> {
  return runWithRepoExclusive(repoPath, async () => {
    try {
      const { stdout } = await $({ cwd: repoPath })`jj file show -r ${commitId} ${filePath}`;
      return stdout;
    } catch (error) {
      throw new Error(`Failed to get file content for ${filePath} at ${commitId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

/**
 * Extract specified line ranges from content
 */
function extractLineRanges(content: string, ranges: HunkRange[]): string {
  const lines = content.split('\n');
  const selectedLines = new Set<number>();

  // Mark all lines that should be included
  for (const range of ranges) {
    for (let i = range.startLine - 1; i < range.endLine && i < lines.length; i++) {
      selectedLines.add(i);
    }
  }

  // Extract selected lines
  const result = lines.filter((_, index) => selectedLines.has(index));
  return result.join('\n');
}

/**
 * Extract the complement of specified line ranges from content
 */
function extractComplementLineRanges(content: string, ranges: HunkRange[]): string {
  const lines = content.split('\n');
  const excludedLines = new Set<number>();

  // Mark all lines that should be excluded
  for (const range of ranges) {
    for (let i = range.startLine - 1; i < range.endLine && i < lines.length; i++) {
      excludedLines.add(i);
    }
  }

  // Extract non-excluded lines
  const result = lines.filter((_, index) => !excludedLines.has(index));
  return result.join('\n');
}

/**
 * Execute hunk split by line ranges
 * This splits specific line ranges from a commit into a new commit
 */
export async function executeHunkSplit(
  repoPath: string,
  sourceCommitId: CommitId,
  hunkRanges: HunkRange[],
  position: Position,
  description?: string
): Promise<void> {
  console.log(`✂️ Executing hunk split: ${sourceCommitId} ranges: ${hunkRanges.map(r => `${r.filePath}:${r.startLine}-${r.endLine}`).join(', ')} to ${JSON.stringify(position)}`);

  // Group ranges by file
  const rangesByFile = new Map<string, HunkRange[]>();
  for (const range of hunkRanges) {
    const existing = rangesByFile.get(range.filePath) || [];
    existing.push(range);
    rangesByFile.set(range.filePath, existing);
  }

  await runWithRepoExclusive(repoPath, async () => {
    // Step 1: Get the original file contents from the source commit
    const fileContents = new Map<string, string>();
    for (const filePath of rangesByFile.keys()) {
      const content = await getFileContent(repoPath, sourceCommitId, filePath);
      fileContents.set(filePath, content);
    }

    // Step 2: First, modify the source commit to have only the remaining content
    await executeJjCommand(repoPath, 'edit', ['-r', sourceCommitId]);

    for (const [filePath, content] of fileContents.entries()) {
      const ranges = rangesByFile.get(filePath)!;
      const remainingContent = extractComplementLineRanges(content, ranges);
      const fullPath = join(repoPath, filePath);

      if (remainingContent.trim() === '') {
        // If no content remains, delete the file
        await executeJjCommand(repoPath, 'file', ['untrack', filePath]);
      } else {
        await writeFile(fullPath, remainingContent);
      }
    }

    // Step 3: Create a new empty commit at the position
    const newArgs: string[] = [];
    if (position.kind === 'before') {
      newArgs.push('--insert-before', position.commit);
    } else if (position.kind === 'after') {
      newArgs.push('--insert-after', position.commit);
    } else if (position.kind === 'between-commits') {
      newArgs.push('--insert-after', position.afterCommit);
      if (position.afterCommit !== sourceCommitId) {
        newArgs.push('--insert-before', position.beforeCommit);
      }
    } else if (position.kind === 'new-branch') {
      newArgs.push('--destination', position.commit);
    } else if (position.kind === 'existing-commit') {
      throw new Error('existing-commit position not supported for hunk split - use evosquash instead');
    } else {
      // Exhaustive check: this should never happen if all position kinds are handled
      const _exhaustive: never = position;
      throw new Error(`Unsupported position kind for hunk split: ${_exhaustive}`);
    }

    await executeJjCommand(repoPath, 'new', newArgs);

    // Step 4: Write the split content to the new commit (which is now @)
    for (const [filePath, content] of fileContents.entries()) {
      const ranges = rangesByFile.get(filePath)!;
      const splitContent = extractLineRanges(content, ranges);
      const fullPath = join(repoPath, filePath);
      await writeFile(fullPath, splitContent);
    }

    // Set description on the new commit if provided
    if (description) {
      await executeJjCommand(repoPath, 'describe', ['-m', description]);
    }

    console.log('✅ Hunk split completed successfully');
  });
}

/**
 * Command execution functions
 */

export async function executeRebase(repoPath: string, commitId: CommitId, position: Position): Promise<void> {
  await match(position)
    .with({ kind: 'before' }, async (p) => {
      // Move commit before position
      await executeJjCommand(repoPath, 'rebase', ['-r', commitId, '--insert-before', p.commit]);
    })
    .with({ kind: 'after' }, async (p) => {
      // Move commit after position
      await executeJjCommand(repoPath, 'rebase', ['-r', commitId, '--insert-after', p.commit]);
    })
    .with({ kind: 'between-commits' }, async (p) => {
      // Reorder commit between two neighbors
      await executeJjCommand(repoPath, 'rebase', [
        '-r',
        commitId,
        '--insert-after',
        p.beforeCommit,
        '--insert-before',
        p.afterCommit,
      ]);
    })
    .with({ kind: 'new-branch' }, async (p) => {
      // Create new branch from specified commit
      await executeJjCommand(repoPath, 'rebase', ['-r', commitId, '--destination', p.commit]);
    })
    .with({ kind: 'existing-commit' }, async (p) => {
      // Rebase onto existing commit (same as 'after')
      await executeJjCommand(repoPath, 'rebase', ['-r', commitId, '--destination', p.commit]);
    })
    .exhaustive();
}

export async function executeAbandon(repoPath: string, commitId: CommitId): Promise<void> {
  await executeJjCommand(repoPath, 'abandon', ['-r', commitId]);
}

export async function executeCreateEmptyChange(repoPath: string, position: Position): Promise<void> {
  await match(position)
    .with({ kind: 'before' }, async (p) => {
      await executeJjCommand(repoPath, 'new', ['--insert-before', p.commit]);
    })
    .with({ kind: 'after' }, async (p) => {
      await executeJjCommand(repoPath, 'new', ['--insert-after', p.commit]);
    })
    .with({ kind: 'between-commits' }, async (p) => {
      await executeJjCommand(repoPath, 'new', [
        '--insert-after',
        p.beforeCommit,
        '--insert-before',
        p.afterCommit,
      ]);
    })
    .with({ kind: 'new-branch' }, async (p) => {
      // Creating a new branch should fork from the commit without rebasing children.
      await executeJjCommand(repoPath, 'new', [p.commit]);
    })
    .with({ kind: 'existing-commit' }, () => {
      throw new Error('Cannot create a new empty change inside an existing commit');
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
  position: Position
): Promise<void> {
  console.log(`✂️ Executing split: ${sourceCommitId} files: ${files.map(f => f.path).join(', ')} to ${JSON.stringify(position)}`);

  const filePaths = files.map(f => f.path);

  await match(position)
    .with({ kind: 'before' }, async (p) => {
      // Split files into a new commit before position
      await executeJjCommand(repoPath, 'split', ['-r', sourceCommitId, '--insert-before', p.commit, '--', ...filePaths]);
    })
    .with({ kind: 'after' }, async (p) => {
      // Split files into a new commit after position
      await executeJjCommand(repoPath, 'split', ['-r', sourceCommitId, '--insert-after', p.commit, '--', ...filePaths]);
    })
    .with({ kind: 'between-commits' }, async (p) => {
      // Split files into a new commit between two commits
      // --insert-after means "after" (descendant of) and --insert-before means "before" (ancestor of)
      // To place the split between beforeCommit and afterCommit:
      // We want: beforeCommit → [new split commit] → afterCommit
      // So: --insert-after beforeCommit (new commit is after/descendant of beforeCommit)
      //     --insert-before afterCommit (new commit is before/ancestor of afterCommit)

      // However, if afterCommit is the same as sourceCommitId, we can't use it as --insert-before
      // because that would create a loop. In this case, just use --insert-after beforeCommit
      if (p.afterCommit === sourceCommitId) {
        console.log(`⚠️ afterCommit same as sourceCommitId, using only --insert-after ${p.beforeCommit}`);
        await executeJjCommand(repoPath, 'split', ['-r', sourceCommitId, '--insert-after', p.beforeCommit, '--', ...filePaths]);
      } else {
        await executeJjCommand(repoPath, 'split', ['-r', sourceCommitId, '--insert-after', p.beforeCommit, '--insert-before', p.afterCommit, '--', ...filePaths]);
      }
    })
    .with({ kind: 'existing-commit' }, async (p) => {
      // Split files into an existing commit (use destination)
      await executeJjCommand(repoPath, 'split', ['-r', sourceCommitId, '-d', p.commit, '--', ...filePaths]);
    })
    .with({ kind: 'new-branch' }, async (p) => {
      // Split files to new branch from commit
      await executeJjCommand(repoPath, 'split', ['-r', sourceCommitId, '--destination', p.commit, '--', ...filePaths]);
    })
    .exhaustive();
}

export async function executeMoveBookmark(
  repoPath: string,
  bookmarkName: BookmarkName,
  targetCommitId: CommitId
): Promise<void> {
  await executeJjCommand(repoPath, 'bookmark', ['set', '--allow-backwards', bookmarkName, '-r', targetCommitId]);
}

export async function executeDeleteBookmark(
  repoPath: string,
  bookmarkName: BookmarkName
): Promise<void> {
  await executeJjCommand(repoPath, 'bookmark', ['delete', bookmarkName]);
}

export async function executeCreateBookmark(
  repoPath: string,
  bookmarkName: BookmarkName,
  targetCommitId: CommitId
): Promise<void> {
  await executeJjCommand(repoPath, 'bookmark', ['set', bookmarkName, '-r', targetCommitId]);
}

export async function executeSplitAtEvolog(
  repoPath: string,
  changeCommitId: CommitId,
  entryCommitId: CommitId
): Promise<void> {
  if (changeCommitId === entryCommitId) {
    throw new Error('Cannot split at the current version of the change');
  }

  const changeMetadataTemplate = 'change_id ++ "|" ++ parents.map(|p| p.commit_id()).join(",")';
  const changeMetadataOutput = await runWithRepoExclusive(repoPath, async () => {
    const { stdout } = await $({ cwd: repoPath })`jj log --no-graph -r ${changeCommitId} --template ${changeMetadataTemplate}`;
    return stdout;
  });
  const [changeIdRaw, parentListRaw = ''] = changeMetadataOutput.trim().split('|');
  if (!changeIdRaw) {
    throw new Error(`Unable to determine change ID for commit ${changeCommitId}`);
  }
  const changeId = createChangeId(changeIdRaw);
  const parentCommitIds = parentListRaw
    .split(',')
    .map(part => part.trim())
    .filter(part => part.length > 0)
    .map(createCommitId);
  
  console.log(`🧾 Split-at-evolog metadata: change=${changeId} parents=${parentCommitIds.join(', ') || '(none)'}`);

  const evologEntries = await getCommitEvolog(repoPath, changeCommitId);
  const entryExists = evologEntries.some((entry) => entry.commitId === entryCommitId);
  if (!entryExists) {
    throw new Error('Selected evolog entry does not belong to the target change');
  }

  const insertAfterArgs = parentCommitIds.flatMap(parentCommitId => ['--insert-after', parentCommitId]);
  console.log(
    `🪄 Duplicating evolog entry ${entryCommitId} with targets after=[${parentCommitIds.join(', ') || '(none)'}] before=${changeCommitId}`
  );

  await executeJjCommand(
    repoPath,
    'duplicate',
    [
      entryCommitId,
      ...insertAfterArgs,
      '--insert-before',
      changeCommitId
    ]
  );

  const changeRevset = `change_id(${changeId})`;
  console.log(`🔍 Checking conflicts for ${changeRevset}`);
  const conflictStatusOutput = await runWithRepoExclusive(repoPath, async () => {
    const { stdout } = await $({ cwd: repoPath })`jj log --no-graph -r ${changeRevset} --template ${'if(conflict, "true", "false")'}`;
    return stdout;
  });
  console.log(`🧮 Conflict status raw output: ${JSON.stringify(conflictStatusOutput)}`);
  const conflictTokens = conflictStatusOutput
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length > 0);
  console.log(`📊 Conflict status tokens: ${conflictTokens.join(', ') || '(none)'}`);
  const hasConflicts = conflictTokens.includes('true');

  if (!hasConflicts) {
    console.log('✅ No conflicts detected after duplicate');
    return;
  }

  console.log(`⚠️ Conflicts detected. Gathering paths for ${changeRevset}`);
  try {
    const conflictListOutput = await runWithRepoExclusive(repoPath, async () => {
      const { stdout } = await $({ cwd: repoPath })`jj resolve -r ${changeRevset} --list`;
      return stdout;
    });
    console.log(`📄 Conflict list raw output: ${JSON.stringify(conflictListOutput)}`);
    const conflictPaths = conflictListOutput
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => line.split(/\s+/)[0])
      .filter((path) => path.length > 0);

    if (conflictPaths.length === 0) {
      console.log('⚠️ Resolve list returned no conflict paths; skipping auto-resolution');
      return;
    }

    console.log(`🛠️ Auto-resolving conflicts via :theirs for paths: ${conflictPaths.join(', ')}`);
    await executeJjCommand(repoPath, 'resolve', ['-r', changeRevset, '--tool', ':theirs', ...conflictPaths]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Error while resolving conflicts for ${changeRevset}: ${message}`);
    if (!message.includes('No conflicts found')) {
      throw error;
    }
  }
}

export async function executeUpdateDescription(
  repoPath: string,
  commitId: CommitId,
  newDescription: string
): Promise<void> {
  const description = createDescription(newDescription);
  await executeJjCommand(repoPath, 'describe', ['-r', commitId, '-m', description]);
}

export async function executeCheckout(
  repoPath: string,
  commitId: CommitId
): Promise<void> {
  await executeJjCommand(repoPath, 'edit', ['-r', commitId]);
}

/**
 * Execute undo operation
 */
export async function executeUndo(repoPath: string): Promise<void> {
  await executeJjCommand(repoPath, 'undo', []);
}

/**
 * Execute redo operation
 */
export async function executeRedo(repoPath: string): Promise<void> {
  await executeJjCommand(repoPath, 'redo', []);
}

/**
 * Get operation log
 */
export async function getOperationLog(repoPath: string): Promise<OpLogEntry[]> {
  return runWithRepoExclusive(repoPath, async () => {
    try {
      // Use jj op log with custom template to get parseable output
      // Fetch both short and full operation IDs for matching
      const template = 'id.short() ++ "|" ++ id ++ "|" ++ description ++ "|" ++ time.end().format("%Y-%m-%d %H:%M:%S") ++ "|" ++ user ++ "\\n"';
      const { stdout } = await $({ cwd: repoPath })`jj op log --no-graph --template ${template} --limit 50`;

      const entries: OpLogEntry[] = [];
      const lines = stdout.trim().split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;

        // Parse the pipe-separated format: operationId|fullOperationId|operationDescription|timestamp|user
        const parts = line.split('|');
        if (parts.length >= 5) {
          const [operationId, fullOperationId, operationDescription, timestamp, user] = parts;

          entries.push({
            operationId: operationId.trim(),
            fullOperationId: fullOperationId.trim(),
            operationDescription: operationDescription.trim(),
            timestamp: timestamp.trim(),
            user: user.trim(),
          });
        }
      }

      return entries;
    } catch (error) {
      console.error('Error fetching operation log:', error);
      return [];
    }
  });
}

export async function getDescription(repoPath: string, ref: string): Promise<Description> {
  return runWithRepoExclusive(repoPath, async () => {
    const { stdout } = await $({ cwd: repoPath })`jj log --no-graph -r ${ref} --template description`;
    return createDescription(stdout);
  });
}

export async function currentOpId(repoPath: string) {
  return runWithRepoExclusive(repoPath, async () => {
    const { stdout } = await $({ cwd: repoPath })`jj op log -n1 --no-graph -T self.id()`;
    const opId = stdout.trim();
    if (!opId) {
      throw new Error('No current operation');
    }
    return opId;
  });
}

export async function* watchRepoChanges(repoPath: string, revset: string) {
  const jjPath = join(repoPath, '.jj/repo/op_heads/');

  const initialSnapshot = await runWithRepoExclusive(repoPath, async () => {
    const opHead = await currentOpId(repoPath);
    const commits = await getRepositoryCommits(repoPath, revset);
    const currentCommitId = await getCurrentCommitId(repoPath);
    const gitHeadCommitId = await getGitHeadCommitId(repoPath);
    const bookmarks = await getBookmarks(repoPath);
    const workspaceBookmarkName = createBookmarkName('@');
    const gitHeadBookmarkName = createBookmarkName('git_head()');

    if (currentCommitId) {
      const alreadyPresent = bookmarks.some(b => b.name === workspaceBookmarkName);
      if (!alreadyPresent) {
        bookmarks.push({
          name: workspaceBookmarkName,
          commitId: currentCommitId,
        });
      }
    }
    if (gitHeadCommitId) {
      const alreadyPresent = bookmarks.some(b => b.name === gitHeadBookmarkName);
      if (!alreadyPresent) {
        bookmarks.push({
          name: gitHeadBookmarkName,
          commitId: gitHeadCommitId,
        });
      }
    }
    return { opHead, commits, currentCommitId, bookmarks };
  });

  let lastOpHead = initialSnapshot.opHead;
  console.log(`📦 watchRepoChanges initial emit: ${initialSnapshot.commits.length} commits`);
  yield {
    commits: initialSnapshot.commits,
    opHead: lastOpHead,
    currentCommitId: initialSnapshot.currentCommitId,
    bookmarks: initialSnapshot.bookmarks
  };
  
  for await (const { filename, eventType } of watch(jjPath, { recursive: true })) {
    console.log(`🛎️ Detected ${eventType} on ${filename} in ${jjPath}`);
    type WatchUpdate =
      | { kind: 'unchanged'; currentOpHead: string }
      | { kind: 'changed'; currentOpHead: string; commits: Commit[]; currentCommitId: CommitId | null; bookmarks: Bookmark[] };

      const update = await runWithRepoExclusive(repoPath, async (): Promise<WatchUpdate> => {
        const currentOpHead = await currentOpId(repoPath);
        if (currentOpHead === lastOpHead) {
          return { kind: 'unchanged', currentOpHead };
        }

      const commits = await getRepositoryCommits(repoPath, revset);
      const currentCommitId = await getCurrentCommitId(repoPath);
      const gitHeadCommitId = await getGitHeadCommitId(repoPath);
      const bookmarks = await getBookmarks(repoPath);
      const workspaceBookmarkName = createBookmarkName('@');
      const gitHeadBookmarkName = createBookmarkName('git_head()');

      if (currentCommitId) {
        const alreadyPresent = bookmarks.some(b => b.name === workspaceBookmarkName);
        if (!alreadyPresent) {
          bookmarks.push({
            name: workspaceBookmarkName,
            commitId: currentCommitId,
          });
        }
      }
      if (gitHeadCommitId) {
        const alreadyPresent = bookmarks.some(b => b.name === gitHeadBookmarkName);
        if (!alreadyPresent) {
          bookmarks.push({
            name: gitHeadBookmarkName,
            commitId: gitHeadCommitId,
          });
        }
      }
      console.log('🔖 watchRepoChanges update bookmarks:', bookmarks.map(b => `${b.name}:${b.commitId}`).join(', ') || '(none)');
      return {
        kind: 'changed',
        currentOpHead,
        commits,
          currentCommitId,
        bookmarks
      };
    });

    if (update.kind === 'changed') {
      console.log(`🔄 Operation head changed from ${lastOpHead} to ${update.currentOpHead}`);
      lastOpHead = update.currentOpHead;
      console.log(`📦 watchRepoChanges change emit: ${update.commits.length} commits`);
      yield {
        commits: update.commits,
        opHead: lastOpHead,
        currentCommitId: update.currentCommitId,
        bookmarks: update.bookmarks
      };
    } else {
      console.log(`ℹ️ Operation head unchanged (${update.currentOpHead}), no update emitted`);
    }
  }
}
