import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createTestRepo,
  createCommit,
  getCommitFiles,
  type TestRepo
} from './test-helpers.js';
import {
  executeMoveFiles
} from './repo-parser.js';

describe('Simple Command Tests', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepo();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('should move a single file from one commit to another', async () => {
    // Setup: Create two commits and capture their commit IDs
    const commit1 = await createCommit(repo, 'First commit', {
      'file1.txt': 'content1',
      'file2.txt': 'content2'
    });
    const commit2 = await createCommit(repo, 'Second commit', {
      'file3.txt': 'content3'
    });

    console.log('Created commits:', commit1.commitId, commit2.commitId);

    // Check initial state
    const commit1FilesBefore = await getCommitFiles(repo, commit1.changeId);
    const commit2FilesBefore = await getCommitFiles(repo, commit2.changeId);

    console.log('Commit1 files before:', commit1FilesBefore);
    console.log('Commit2 files before:', commit2FilesBefore);

    await executeMoveFiles(
      repo.path,
      commit1.commitId,
      commit2.commitId,
      [{ path: 'file1.txt', status: 'A', additions: 1, deletions: 0 }]
    );

    // Check final state
    const commit1FilesAfter = await getCommitFiles(repo, commit1.changeId);
    const commit2FilesAfter = await getCommitFiles(repo, commit2.changeId);

    console.log('Commit1 files after:', commit1FilesAfter);
    console.log('Commit2 files after:', commit2FilesAfter);

    expect(commit1FilesAfter).toHaveLength(1);
    expect(commit1FilesAfter[0].path).toBe('file2.txt');

    expect(commit2FilesAfter).toHaveLength(2);
    const filePaths = commit2FilesAfter.map(f => f.path).sort();
    expect(filePaths).toContain('file1.txt');
    expect(filePaths).toContain('file3.txt');
  }, 10000);
});
