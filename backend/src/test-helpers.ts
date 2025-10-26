import { execa } from 'execa';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ChangeId, createChangeId, createCommitId, type CommitId } from './repo-parser.js';

export interface TestRepoCommit {
  id?: string; // Will be populated after creation
  message: string;
  files: Record<string, string>; // path -> content
  parent?: string; // Parent commit ID
}

export interface TestRepo {
  path: string;
  commits: Map<string, string>; // message -> commitId
  cleanup: () => Promise<void>;
}

/**
 * Creates a temporary test repository with jj
 */
export async function createTestRepo(): Promise<TestRepo> {
  const tempDir = await mkdtemp(join(tmpdir(), 'jj-test-'));

  // Initialize jj repo
  await execa('jj', ['git', 'init', '--colocate'], { cwd: tempDir });

  // Configure git user for the test repo
  await execa('git', ['config', 'user.name', 'Test User'], { cwd: tempDir });
  await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: tempDir });

  return {
    path: tempDir,
    commits: new Map(),
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
    }
  };
}

/**
 * Creates a commit in the test repository
 * Returns both commitId and changeId (changeId is stable across rewrites)
 */
export async function createCommit(
  repo: TestRepo,
  message: string,
  files: Record<string, string> = {}
): Promise<{ changeId: ChangeId; commitId: CommitId }> {
  // Create/update files
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = join(repo.path, filePath);
    const dir = join(fullPath, '..');
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, content);
  }

  // Describe and create the commit
  await execa('jj', ['describe', '-m', message], { cwd: repo.path });

  // Get the change ID (stable across rewrites)
  const { stdout: changeId } = await execa('jj', ['log', '--no-graph', '-r', '@', '-T', 'change_id'], { cwd: repo.path });
  const trimmedChangeId = changeId.trim();

  // Get the commit ID
  const { stdout: commitId } = await execa('jj', ['log', '--no-graph', '-r', '@', '-T', 'commit_id'], { cwd: repo.path });
  const trimmedCommitId = commitId.trim();

  // Create a new working copy for the next commit
  await execa('jj', ['new'], { cwd: repo.path });

  // Store the change ID
  repo.commits.set(message, trimmedChangeId);

  return { changeId: createChangeId(trimmedChangeId), commitId: createCommitId(trimmedCommitId) };
}

/**
 * Gets the current commit ID for a change ID (since commit IDs can change in jj)
 */
export async function getCommitIdFromChangeId(repo: TestRepo, changeId: string): Promise<string> {
  const selector = `change_id(${changeId})`;
  const template = 'commit_id ++ "\\n"';
  const { stdout } = await execa('jj', ['log', '--no-graph', '-r', selector, '-T', template], { cwd: repo.path });
  const tokens = stdout.trim().split(/\s+/).filter(token => token.length > 0);
  if (tokens.length === 0) {
    throw new Error(`No commit found for change ${changeId}`);
  }
  return tokens[0].trim();
}

/**
 * Creates a new branch at a specific commit
 */
export async function createBranch(
  repo: TestRepo,
  branchName: string,
  commitId: string
): Promise<void> {
  await execa('jj', ['branch', 'create', branchName, '-r', commitId], { cwd: repo.path });
}

/**
 * Gets the current commit ID of the working copy
 */
export async function getCurrentCommitId(repo: TestRepo): Promise<string> {
  const { stdout } = await execa('jj', ['log', '--no-graph', '-r', '@', '-T', 'commit_id'], { cwd: repo.path });
  return stdout.trim();
}

/**
 * Gets all commits in the repository
 */
export async function getAllCommits(repo: TestRepo): Promise<Array<{ id: string; changeId: string; message: string; parents: string[] }>> {
  const { stdout } = await execa(
    'jj',
    ['log', '--no-graph', '-r', 'all()', '-T', 'commit_id ++ "|" ++ change_id ++ "|" ++ description ++ "|" ++ parents.map(|p| p.commit_id()).join(",")'],
    { cwd: repo.path }
  );

  return stdout
    .split('\n')
    .filter(line => line.trim())
    .filter(line => !line.includes('0000000000000000')) // Skip root commit
    .map(line => {
      const [id, changeId, message, parentsStr] = line.split('|');
      const parents = parentsStr ? parentsStr.split(',').filter(p => p && !p.includes('0000000000000000')) : [];
      return { id: id.trim(), changeId: changeId.trim(), message: message.trim(), parents };
    });
}

/**
 * Gets file changes for a specific commit or change ID
 */
export async function getCommitFiles(
  repo: TestRepo,
  revisionOrChangeId: string
): Promise<Array<{ path: string; status: string }>> {
  try {
    const { stdout: diffOutput } = await execa(
      'jj',
      ['diff', '-r', revisionOrChangeId, '--summary'],
      { cwd: repo.path }
    );

    const files: Array<{ path: string; status: string }> = [];

    for (const line of diffOutput.split('\n')) {
      if (!line.trim()) continue;

      // Parse jj diff --summary format
      // Format examples:
      // A path/to/file.txt
      // M path/to/file.txt
      // D path/to/file.txt
      const match = line.match(/^([AMD])\s+(.+)$/);
      if (match) {
        const [, statusChar, path] = match;
        const status = statusChar === 'A' ? 'added' : statusChar === 'M' ? 'modified' : 'removed';
        files.push({ path: path.trim(), status });
      }
    }

    return files;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isCommitHash = /^[0-9a-f]{40}$/.test(revisionOrChangeId);

    if (!isCommitHash && message.includes('is divergent')) {
      const currentCommitId = await getCommitIdFromChangeId(repo, revisionOrChangeId);
      return getCommitFiles(repo, currentCommitId);
    }

    throw new Error(`Failed to get files for ${revisionOrChangeId}: ${message}`);
  }
}

/**
 * Gets the content of a file at a specific commit
 */
export async function getFileContent(
  repo: TestRepo,
  commitId: string,
  filePath: string
): Promise<string> {
  const { stdout } = await execa(
    'jj',
    ['file', 'show', '-r', commitId, filePath],
    { cwd: repo.path }
  );
  return stdout;
}

/**
 * Asserts that a commit exists with the expected properties
 */
export async function assertCommitExists(
  repo: TestRepo,
  options: {
    message?: string;
    files?: Array<{ path: string; status: string }>;
    parents?: string[];
  }
): Promise<string> {
  const allCommits = await getAllCommits(repo);

  let matchingCommit = allCommits.find(c => {
    if (options.message && !c.message.includes(options.message)) {
      return false;
    }
    if (options.parents && options.parents.length > 0) {
      if (c.parents.length !== options.parents.length) return false;
      for (const parent of options.parents) {
        if (!c.parents.includes(parent)) return false;
      }
    }
    return true;
  });

  if (!matchingCommit) {
    throw new Error(`No commit found matching criteria: ${JSON.stringify(options)}`);
  }

  if (options.files) {
    const actualFiles = await getCommitFiles(repo, matchingCommit.id);

    for (const expectedFile of options.files) {
      const actualFile = actualFiles.find(f => f.path === expectedFile.path);
      if (!actualFile) {
        throw new Error(`Expected file ${expectedFile.path} not found in commit ${matchingCommit.id}`);
      }
      if (actualFile.status !== expectedFile.status) {
        throw new Error(
          `File ${expectedFile.path} has status ${actualFile.status}, expected ${expectedFile.status}`
        );
      }
    }
  }

  return matchingCommit.id;
}

/**
 * Asserts that two commits have a parent-child relationship
 * Can use either commit IDs or change IDs
 */
export async function assertParentChild(
  repo: TestRepo,
  childRevision: string,
  parentRevision: string
): Promise<void> {
  const resolveCommitId = async (revision: string) => {
    if (/^[0-9a-f]{40}$/.test(revision)) {
      return revision;
    }
    return getCommitIdFromChangeId(repo, revision);
  };

  const childCommitId = await resolveCommitId(childRevision);
  const parentCommitId = await resolveCommitId(parentRevision);

  try {
    const { stdout } = await execa(
      'jj',
      ['log', '--no-graph', '-r', childCommitId, '-T', 'parents.map(|p| p.commit_id()).join(",")'],
      { cwd: repo.path }
    );

    const parents = stdout.trim() === ''
      ? []
      : stdout.trim().split(',').map(parent => parent.trim()).filter(parent => parent.length > 0);

    if (!parents.includes(parentCommitId)) {
      throw new Error(
        `Commit ${childCommitId} does not list ${parentCommitId} as a parent. Parents: ${parents.join(', ')}`
      );
    }
  } catch (error) {
    throw new Error(
      `Failed to verify parent/child relationship for child=${childRevision}, parent=${parentRevision}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Gets the commit message for a commit ID
 */
export async function getCommitMessage(repo: TestRepo, commitId: string): Promise<string> {
  const { stdout } = await execa(
    'jj',
    ['log', '--no-graph', '-r', commitId, '-T', 'description'],
    { cwd: repo.path }
  );
  return stdout.trim();
}
