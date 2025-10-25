import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import {
  createTestRepo,
  createCommit,
  getAllCommits,
  getCommitFiles,
  getCommitIdFromChangeId,
  assertCommitExists,
  assertParentChild,
  type TestRepo
} from './test-helpers.js';
import {
  executeRebase,
  executeSquash,
  executeSplit,
  executeMoveFiles,
  executeUpdateDescription,
  createCommitId,
  getDescription,
  executeSplitAtEvolog,
  getCommitEvolog,
  createChangeId,
  getRepositoryCommits
} from './repo-parser.js';

describe('Git Commands', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepo();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  describe('executeMoveFiles', () => {
    it('should move a single file from one commit to another', async () => {
      // Setup: Create two commits
      const commit1 = await createCommit(repo, 'First commit', {
        'file1.txt': 'content1',
        'file2.txt': 'content2'
      });
      const commit2 = await createCommit(repo, 'Second commit', {
        'file3.txt': 'content3'
      });

      // Move file1.txt from commit1 to commit2
      await executeMoveFiles(
        repo.path,
        commit1.commitId,
        commit2.commitId,
        [{ path: 'file1.txt', status: 'A' }]
      );

      // Verify commit1 only has file2.txt
      const commit1Files = await getCommitFiles(repo, commit1.changeId);
      expect(commit1Files).toHaveLength(1);
      expect(commit1Files[0].path).toBe('file2.txt');

      // Verify commit2 has both file3.txt and file1.txt
      const commit2Files = await getCommitFiles(repo, commit2.changeId);
      expect(commit2Files).toHaveLength(2);
      const filePaths = commit2Files.map(f => f.path).sort();
      expect(filePaths).toContain('file1.txt');
      expect(filePaths).toContain('file3.txt');
    });

    it('should move multiple files between commits', async () => {
      const commit1 = await createCommit(repo, 'First commit', {
        'file1.txt': 'content1',
        'file2.txt': 'content2',
        'file3.txt': 'content3'
      });
      const commit2 = await createCommit(repo, 'Second commit', {
        'file4.txt': 'content4'
      });

      await executeMoveFiles(
        repo.path,
        createCommitId(commit1.commitId),
        createCommitId(commit2.commitId),
        [
          { path: 'file1.txt', status: 'A' },
          { path: 'file2.txt', status: 'A' }
        ]
      );

      const commit1Files = await getCommitFiles(repo, commit1.changeId);
      expect(commit1Files).toHaveLength(1);
      expect(commit1Files[0].path).toBe('file3.txt');

      const commit2Files = await getCommitFiles(repo, commit2.changeId);
      expect(commit2Files).toHaveLength(3);
      const filePaths = commit2Files.map(f => f.path).sort();
      expect(filePaths).toEqual(['file1.txt', 'file2.txt', 'file4.txt']);
    });
  });

  describe('executeSquash', () => {
    it('should squash a commit into its parent', async () => {
      const commit1 = await createCommit(repo, 'First commit', {
        'file1.txt': 'content1'
      });
      const commit2 = await createCommit(repo, 'Second commit', {
        'file2.txt': 'content2'
      });

      await executeSquash(
        repo.path,
        commit2.commitId,
        commit1.commitId
      );

      // Verify commit1 now has both files
      const commit1Files = await getCommitFiles(repo, commit1.changeId);
      expect(commit1Files).toHaveLength(2);
      const filePaths = commit1Files.map(f => f.path).sort();
      expect(filePaths).toEqual(['file1.txt', 'file2.txt']);

      // Verify commit2 no longer exists as separate commit with its original message
      const allCommits = await getAllCommits(repo);
      const commit2Exists = allCommits.some(c => c.message === 'Second commit' && c.changeId === commit2.changeId);
      expect(commit2Exists).toBe(false);
    });

    it('should squash multiple commits in sequence', async () => {
      const commit1 = await createCommit(repo, 'Base commit', {
        'base.txt': 'base'
      });
      const commit2 = await createCommit(repo, 'Feature A', {
        'featureA.txt': 'A'
      });
      const commit3 = await createCommit(repo, 'Feature B', {
        'featureB.txt': 'B'
      });

      // Squash commit2 into commit1
      await executeSquash(
        repo.path,
        commit2.commitId,
        commit1.commitId
      );

      const updatedCommit1Id = await getCommitIdFromChangeId(repo, commit1.changeId);

      // Squash commit3 into commit1
      await executeSquash(
        repo.path,
        commit3.commitId,
        createCommitId(updatedCommit1Id)
      );

      // Verify commit1 has all files
      const commit1Files = await getCommitFiles(repo, commit1.changeId);
      expect(commit1Files).toHaveLength(3);
      const filePaths = commit1Files.map(f => f.path).sort();
      expect(filePaths).toEqual(['base.txt', 'featureA.txt', 'featureB.txt']);
    });
  });

  describe('executeUpdateDescription', () => {
    it('updates the description of a commit', async () => {
      const commit = await createCommit(repo, 'Original message', {
        'file.txt': 'content'
      });

      await executeUpdateDescription(repo.path, commit.commitId, 'Updated message');

      const updatedCommitId = await getCommitIdFromChangeId(repo, commit.changeId);
      expect(updatedCommitId).not.toBe(commit.commitId);

      const updatedDescription = await getDescription(repo.path, updatedCommitId);
      expect(updatedDescription).toBe('Updated message');
    });

    it('uses fallback description when message is empty', async () => {
      const commit = await createCommit(repo, 'Another message', {
        'file.txt': 'content'
      });

      await executeUpdateDescription(repo.path, commit.commitId, '   ');

      const updatedCommitId = await getCommitIdFromChangeId(repo, commit.changeId);
      const updatedDescription = await getDescription(repo.path, updatedCommitId);
      expect(updatedDescription).toBe('(no description)');
    });
  });

  describe('executeSplitAtEvolog', () => {
    it('resolves conflicts by accepting the current version after splitting', async () => {
      const filePath = join(repo.path, 'file.txt');

      await writeFile(filePath, 'base\n');
      await execa('jj', ['describe', '-m', 'Base'], { cwd: repo.path });
      await execa('jj', ['new'], { cwd: repo.path });

      await writeFile(filePath, 'first\n');
      await execa('jj', ['describe', '-m', 'Feature'], { cwd: repo.path });

      await writeFile(filePath, 'second\n');
      await execa('jj', ['describe', '-m', 'Feature'], { cwd: repo.path });

      const { stdout: changeCommitStdout } = await execa('jj', ['log', '--no-graph', '-r', '@', '-T', 'commit_id'], { cwd: repo.path });
      const changeCommitId = createCommitId(changeCommitStdout.trim());

      const { stdout: changeIdStdout } = await execa('jj', ['log', '--no-graph', '-r', changeCommitId, '-T', 'change_id'], { cwd: repo.path });
      const changeId = createChangeId(changeIdStdout.trim());

      const evologEntries = await getCommitEvolog(repo.path, changeCommitId);
      expect(evologEntries.length).toBeGreaterThan(1);

      const previousEntry = evologEntries[1];
      if (!previousEntry) {
        throw new Error('Expected a previous evolog entry');
      }

      await executeSplitAtEvolog(repo.path, changeCommitId, previousEntry.commitId);

      const commits = await getRepositoryCommits(repo.path);
      const latestCommit = commits.find((commit) => commit.changeId === changeId);
      expect(latestCommit).toBeDefined();
      expect(latestCommit?.hasConflicts).toBe(false);

      expect(latestCommit?.parents).toHaveLength(1);
      const parentCommit = commits.find((commit) => commit.id === latestCommit?.parents[0]);
      expect(parentCommit).toBeDefined();
      expect(parentCommit?.hasConflicts).toBe(false);

      const { stdout: conflictStatus } = await execa(
        'jj',
        ['log', '--no-graph', '-r', `change_id(${changeId})`, '-T', 'if(conflict, "true", "false")'],
        { cwd: repo.path }
      );
      expect(conflictStatus.trim()).toBe('false');
    });
  });

  // TODO: revisit once split commands operate correctly when driven by commit IDs.
  describe.skip('executeSplit', () => {
    it('should split files to a new commit after target', async () => {
      const commit1 = await createCommit(repo, 'First commit', {
        'file1.txt': 'content1'
      });
      const commit2 = await createCommit(repo, 'Second commit', {
        'file2.txt': 'content2',
        'file3.txt': 'content3'
      });

      // Split file3.txt from commit2 to a new commit after commit2
      await executeSplit(
        repo.path,
        commit2.commitId,
        [{ path: 'file3.txt', status: 'A' }],
        { type: 'after', commitId: commit2.commitId }
      );

      // Verify commit2 only has file2.txt
      const commit2Files = await getCommitFiles(repo, commit2.changeId);
      expect(commit2Files).toHaveLength(1);
      expect(commit2Files[0].path).toBe('file2.txt');

      // Verify a new commit exists with file3.txt
      const newCommitId = await assertCommitExists(repo, {
        files: [{ path: 'file3.txt', status: 'added' }]
      });

      // Verify the new commit is a child of commit2
      await assertParentChild(repo, newCommitId, commit2.changeId);
    });

    it('should split files to a new commit before target', async () => {
      const commit1 = await createCommit(repo, 'First commit', {
        'file1.txt': 'content1'
      });
      const commit2 = await createCommit(repo, 'Second commit', {
        'file2.txt': 'content2',
        'file3.txt': 'content3'
      });

      // Split file3.txt from commit2 to a new commit before commit2
      await executeSplit(
        repo.path,
        commit2.commitId,
        [{ path: 'file3.txt', status: 'A' }],
        { type: 'before', commitId: commit2.commitId }
      );

      // Verify commit2 only has file2.txt
      const commit2Files = await getCommitFiles(repo, commit2.changeId);
      expect(commit2Files).toHaveLength(1);
      expect(commit2Files[0].path).toBe('file2.txt');

      // Verify a new commit exists with file3.txt
      const newCommitId = await assertCommitExists(repo, {
        files: [{ path: 'file3.txt', status: 'A' }]
      });

      // Verify commit2 is now a child of the new commit
      await assertParentChild(repo, commit2.changeId, newCommitId);
    });

    it('should split files to a new branch', async () => {
      const commit1 = await createCommit(repo, 'Main commit', {
        'file1.txt': 'content1'
      });
      const commit2 = await createCommit(repo, 'Feature commit', {
        'feature1.txt': 'feature1',
        'feature2.txt': 'feature2'
      });

      // Split feature2.txt to a new branch from commit1
      await executeSplit(
        repo.path,
        commit2.commitId,
        [{ path: 'feature2.txt', status: 'A' }],
        { type: 'new-branch', fromCommitId: commit1.commitId }
      );

      // Verify commit2 only has feature1.txt
      const commit2Files = await getCommitFiles(repo, commit2.changeId);
      expect(commit2Files).toHaveLength(1);
      expect(commit2Files[0].path).toBe('feature1.txt');

      // Verify a new commit exists with feature2.txt
      const newCommitId = await assertCommitExists(repo, {
        files: [{ path: 'feature2.txt', status: 'A' }]
      });

      // Verify the new commit is a child of commit1
      await assertParentChild(repo, newCommitId, commit1.changeId);

      // Verify commit2 is still a child of commit1
      await assertParentChild(repo, commit2.changeId, commit1.changeId);
    });

    it('should split files to new commit between two commits', async () => {
      const commit1 = await createCommit(repo, 'First', { 'file1.txt': 'c1' });
      const commit2 = await createCommit(repo, 'Second', { 'file2.txt': 'c2', 'file3.txt': 'c3' });
      const commit3 = await createCommit(repo, 'Third', { 'file4.txt': 'c4' });

      // Split file3.txt from commit2 to a new commit between commit1 and commit3
      await executeSplit(
        repo.path,
        commit2.commitId,
        [{ path: 'file3.txt', status: 'A' }],
        {
          type: 'new-commit-between',
          beforeCommitId: commit1.commitId,
          afterCommitId: commit3.commitId
        }
      );

      // Verify commit2 only has file2.txt
      const commit2Files = await getCommitFiles(repo, commit2.changeId);
      expect(commit2Files).toHaveLength(1);
      expect(commit2Files[0].path).toBe('file2.txt');

      // Verify a new commit exists with file3.txt
      const newCommitId = await assertCommitExists(repo, {
        files: [{ path: 'file3.txt', status: 'A' }]
      });

      // Verify the new commit is a child of commit1
      await assertParentChild(repo, newCommitId, commit1.changeId);

      // Verify commit3 is a child of the new commit
      await assertParentChild(repo, commit3.changeId, newCommitId);
    });
  });

  // TODO: re-enable when rebase flow is confirmed with commit-ID based commands.
  describe.skip('executeRebase', () => {
    it('should rebase a commit after another commit', async () => {
      // Create a linear history: commit1 <- commit2 <- commit3
      const commit1 = await createCommit(repo, 'First', { 'file1.txt': 'c1' });
      const commit2 = await createCommit(repo, 'Second', { 'file2.txt': 'c2' });
      const commit3 = await createCommit(repo, 'Third', { 'file3.txt': 'c3' });

      // Rebase commit2 after commit3 (move it to the end)
      await executeRebase(
        repo.path,
        commit2.commitId,
        { type: 'after', commitId: commit3.commitId }
      );

      // Verify commit2 is now a child of commit3
      await assertParentChild(repo, commit2.changeId, commit3.changeId);

      // Verify commit3 is now a child of commit1
      await assertParentChild(repo, commit3.changeId, commit1.changeId);
    });

    it('should rebase a commit before another commit', async () => {
      const commit1 = await createCommit(repo, 'First', { 'file1.txt': 'c1' });
      const commit2 = await createCommit(repo, 'Second', { 'file2.txt': 'c2' });
      const commit3 = await createCommit(repo, 'Third', { 'file3.txt': 'c3' });

      // Rebase commit3 before commit2 (move it between commit1 and commit2)
      await executeRebase(
        repo.path,
        commit3.commitId,
        { type: 'before', commitId: commit2.commitId }
      );

      // Verify commit3 is now a child of commit1
      await assertParentChild(repo, commit3.changeId, commit1.changeId);

      // Verify commit2 is now a child of commit3
      await assertParentChild(repo, commit2.changeId, commit3.changeId);
    });

    it('should rebase to create a new branch', async () => {
      const commit1 = await createCommit(repo, 'Main', { 'main.txt': 'main' });
      const commit2 = await createCommit(repo, 'Feature A', { 'featureA.txt': 'A' });
      const commit3 = await createCommit(repo, 'Feature B', { 'featureB.txt': 'B' });

      // Rebase commit3 to create a new branch from commit1
      await executeRebase(
        repo.path,
        commit3.commitId,
        { type: 'new-branch', fromCommitId: commit1.commitId }
      );

      // Verify commit3 is now a child of commit1
      await assertParentChild(repo, commit3.changeId, commit1.changeId);

      // Verify commit2 is still a child of commit1
      await assertParentChild(repo, commit2.changeId, commit1.changeId);

      // Verify we now have a branching structure
      const allCommits = await getAllCommits(repo);
      const commit1Data = allCommits.find(c => c.changeId === commit1.changeId);
      expect(commit1Data).toBeDefined();

      // Both commit2 and commit3 should be descendants of commit1
      const descendantsOfCommit1 = commit1Data ? allCommits.filter(c => c.parents.includes(commit1Data.id)) : [];
      expect(descendantsOfCommit1.length).toBeGreaterThanOrEqual(2);
    });
  });

  // TODO: re-enable once split/rebase command behaviour is reliable end-to-end.
  describe.skip('Complex scenarios', () => {
    it('should handle a series of split and move operations', async () => {
      // Create initial commits
      const commit1 = await createCommit(repo, 'Initial', {
        'file1.txt': 'c1',
        'file2.txt': 'c2',
        'file3.txt': 'c3'
      });

      // Split file2 and file3 to new commits
      await executeSplit(
        repo.path,
        commit1.commitId,
        [{ path: 'file2.txt', status: 'A' }],
        { type: 'after', commitId: commit1.commitId }
      );

      // Verify the split happened
      const commit1Files = await getCommitFiles(repo, commit1.changeId);
      expect(commit1Files.map(f => f.path).sort()).toEqual(['file1.txt', 'file3.txt']);

      const commit2Id = await assertCommitExists(repo, {
        files: [{ path: 'file2.txt', status: 'added' }]
      });

      // Now split file3 to after the new commit
      await executeSplit(
        repo.path,
        commit1.commitId,
        [{ path: 'file3.txt', status: 'A' }],
        { type: 'after', commitId: createCommitId(commit2Id) }
      );

      // Verify final state
      const finalCommit1Files = await getCommitFiles(repo, commit1.changeId);
      expect(finalCommit1Files).toHaveLength(1);
      expect(finalCommit1Files[0].path).toBe('file1.txt');

      await assertCommitExists(repo, {
        files: [{ path: 'file3.txt', status: 'added' }]
      });
    });

    it('should handle rebase after squash', async () => {
      const commit1 = await createCommit(repo, 'Base', { 'base.txt': 'base' });
      const commit2 = await createCommit(repo, 'Feature 1', { 'feature1.txt': 'f1' });
      const commit3 = await createCommit(repo, 'Feature 2', { 'feature2.txt': 'f2' });
      const commit4 = await createCommit(repo, 'Feature 3', { 'feature3.txt': 'f3' });

      // Squash commit2 into commit1
      await executeSquash(
        repo.path,
        commit2.commitId,
        commit1.commitId
      );

      // Rebase commit4 to come before commit3
      await executeRebase(
        repo.path,
        commit4.commitId,
        { type: 'before', commitId: commit3.commitId }
      );

      // Verify commit1 has both base and feature1
      const commit1Files = await getCommitFiles(repo, commit1.changeId);
      expect(commit1Files.map(f => f.path).sort()).toEqual(['base.txt', 'feature1.txt']);

      // Verify commit4 comes before commit3
      await assertParentChild(repo, commit3.changeId, commit4.changeId);
    });
  });
});
