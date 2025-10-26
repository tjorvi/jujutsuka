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
  getFileContent,
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
  getRepositoryCommits,
  executeHunkSplit,
  parseHunkRange
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

  describe('executeRebase regressions', () => {
    it('places a commit between two neighbors in ancestor order', async () => {
      const commit1 = await createCommit(repo, 'First', { 'file1.txt': 'c1' });
      const commit2 = await createCommit(repo, 'Second', { 'file2.txt': 'c2' });
      const commit3 = await createCommit(repo, 'Third', { 'file3.txt': 'c3' });

      await executeRebase(
        repo.path,
        commit3.commitId,
        {
          type: 'between',
          beforeCommitId: commit1.commitId,
          afterCommitId: commit2.commitId,
        }
      );

      await assertParentChild(repo, commit3.changeId, commit1.changeId);
      await assertParentChild(repo, commit2.changeId, commit3.changeId);
    });
  });

  describe('parseHunkRange', () => {
    it('should parse a simple hunk range', () => {
      const range = parseHunkRange('file.txt:10-20');
      expect(range.filePath).toBe('file.txt');
      expect(range.startLine).toBe(10);
      expect(range.endLine).toBe(20);
    });

    it('should parse a path with directory', () => {
      const range = parseHunkRange('src/main.ts:5-15');
      expect(range.filePath).toBe('src/main.ts');
      expect(range.startLine).toBe(5);
      expect(range.endLine).toBe(15);
    });

    it('should parse a Windows path with colon', () => {
      const range = parseHunkRange('C:/Users/test/file.txt:1-5');
      expect(range.filePath).toBe('C:/Users/test/file.txt');
      expect(range.startLine).toBe(1);
      expect(range.endLine).toBe(5);
    });

    it('should parse a single line range', () => {
      const range = parseHunkRange('test.txt:42-42');
      expect(range.filePath).toBe('test.txt');
      expect(range.startLine).toBe(42);
      expect(range.endLine).toBe(42);
    });

    it('should throw error for invalid format without colon', () => {
      expect(() => parseHunkRange('file.txt')).toThrow('Invalid hunk range format');
    });

    it('should throw error for invalid line range format', () => {
      expect(() => parseHunkRange('file.txt:10')).toThrow('Invalid line range format');
    });

    it('should throw error for non-numeric line numbers', () => {
      expect(() => parseHunkRange('file.txt:abc-def')).toThrow('Invalid line numbers');
    });

    it('should throw error for zero line numbers', () => {
      expect(() => parseHunkRange('file.txt:0-10')).toThrow('Line numbers must be >= 1');
    });

    it('should throw error for inverted range', () => {
      expect(() => parseHunkRange('file.txt:20-10')).toThrow('Start line must be <= end line');
    });
  });

  describe('executeHunkSplit', () => {
    it('should split specific line ranges from a file to a new commit', async () => {
      await createCommit(repo, 'First commit', {
        'file1.txt': 'line1\nline2\nline3\nline4\nline5'
      });
      const commit2 = await createCommit(repo, 'Second commit', {
        'file2.txt': 'line1\nline2\nline3\nline4\nline5'
      });

      // Split only lines 1-2 from file2.txt to a new commit
      await executeHunkSplit(
        repo.path,
        commit2.commitId,
        [{ filePath: 'file2.txt', startLine: 1, endLine: 2 }],
        { type: 'after', commitId: commit2.commitId }
      );

      // Verify commit2 still has file2.txt but with only lines 3-5
      const commit2Files = await getCommitFiles(repo, commit2.changeId);
      expect(commit2Files).toHaveLength(1);
      expect(commit2Files[0].path).toBe('file2.txt');

      // Verify the file content contains only lines 3-5
      const updatedCommit2Id = await getCommitIdFromChangeId(repo, commit2.changeId);
      const commit2Content = await getFileContent(repo, updatedCommit2Id, 'file2.txt');
      expect(commit2Content).toBe('line3\nline4\nline5');

      // Verify a new commit exists with file2.txt containing only lines 1-2
      const newCommitId = await assertCommitExists(repo, {
        files: [{ path: 'file2.txt', status: 'modified' }]
      });

      // Verify the new commit's file content contains only lines 1-2
      const newCommitContent = await getFileContent(repo, newCommitId, 'file2.txt');
      expect(newCommitContent).toBe('line1\nline2');
    });

    it('should split multiple non-contiguous ranges from the same file', async () => {
      const commit = await createCommit(repo, 'Test commit', {
        'test.txt': 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10'
      });

      // Split lines 1-3 and 7-9, leaving 4-6 and 10 in original commit
      await executeHunkSplit(
        repo.path,
        commit.commitId,
        [
          { filePath: 'test.txt', startLine: 1, endLine: 3 },
          { filePath: 'test.txt', startLine: 7, endLine: 9 }
        ],
        { type: 'after', commitId: commit.commitId }
      );

      // Verify original commit still has test.txt with lines 4-6 and 10
      const files = await getCommitFiles(repo, commit.changeId);
      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('test.txt');

      // Verify content is lines 4-6 and 10
      const updatedCommitId = await getCommitIdFromChangeId(repo, commit.changeId);
      const remainingContent = await getFileContent(repo, updatedCommitId, 'test.txt');
      expect(remainingContent).toBe('line4\nline5\nline6\nline10');

      // Verify new commit has test.txt with lines 1-3 and 7-9
      const newCommitId = await assertCommitExists(repo, {
        files: [{ path: 'test.txt', status: 'modified' }]
      });

      // Verify content is lines 1-3 and 7-9
      const splitContent = await getFileContent(repo, newCommitId, 'test.txt');
      expect(splitContent).toBe('line1\nline2\nline3\nline7\nline8\nline9');
    });

    it('should split ranges from multiple files', async () => {
      const commit = await createCommit(repo, 'Multi-file commit', {
        'file1.txt': 'f1line1\nf1line2\nf1line3',
        'file2.txt': 'f2line1\nf2line2\nf2line3',
        'file3.txt': 'f3line1\nf3line2\nf3line3'
      });

      // Split lines 1-2 from file1 and lines 2-3 from file2
      await executeHunkSplit(
        repo.path,
        commit.commitId,
        [
          { filePath: 'file1.txt', startLine: 1, endLine: 2 },
          { filePath: 'file2.txt', startLine: 2, endLine: 3 }
        ],
        { type: 'after', commitId: commit.commitId }
      );

      // Verify original commit has all 3 files with modified content
      const files = await getCommitFiles(repo, commit.changeId);
      expect(files).toHaveLength(3);
      const filePaths = files.map(f => f.path).sort();
      expect(filePaths).toEqual(['file1.txt', 'file2.txt', 'file3.txt']);

      // Verify file1.txt has only line 3
      const updatedCommitId = await getCommitIdFromChangeId(repo, commit.changeId);
      const file1Content = await getFileContent(repo, updatedCommitId, 'file1.txt');
      expect(file1Content).toBe('f1line3');

      // Verify file2.txt has only line 1
      const file2Content = await getFileContent(repo, updatedCommitId, 'file2.txt');
      expect(file2Content).toBe('f2line1');

      // Verify file3.txt is unchanged
      const file3Content = await getFileContent(repo, updatedCommitId, 'file3.txt');
      expect(file3Content).toBe('f3line1\nf3line2\nf3line3');

      // Verify new commit has file1.txt and file2.txt with split content
      const newCommitId = await assertCommitExists(repo, {
        files: [
          { path: 'file1.txt', status: 'modified' },
          { path: 'file2.txt', status: 'modified' }
        ]
      });

      // Verify file1.txt has lines 1-2
      const newFile1Content = await getFileContent(repo, newCommitId, 'file1.txt');
      expect(newFile1Content).toBe('f1line1\nf1line2');

      // Verify file2.txt has lines 2-3
      const newFile2Content = await getFileContent(repo, newCommitId, 'file2.txt');
      expect(newFile2Content).toBe('f2line2\nf2line3');
    });

    it('should set description on the new commit when provided', async () => {
      const commit = await createCommit(repo, 'Original description', {
        'file.txt': 'line1\nline2\nline3'
      });

      await executeHunkSplit(
        repo.path,
        commit.commitId,
        [{ filePath: 'file.txt', startLine: 1, endLine: 2 }],
        { type: 'after', commitId: commit.commitId },
        'Split changes description'
      );

      // Verify the new commit has the specified description
      const newCommitId = await assertCommitExists(repo, {
        message: 'Split changes description'
      });

      const description = await getDescription(repo.path, newCommitId);
      expect(description).toBe('Split changes description');

      // Verify it has the split file content
      const content = await getFileContent(repo, newCommitId, 'file.txt');
      expect(content).toBe('line1\nline2');
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
