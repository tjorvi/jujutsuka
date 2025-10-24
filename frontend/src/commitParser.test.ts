import { createChangeId, createCommitId, createDescription, createEmail, type Commit } from "../../backend/src/repo-parser";
import { buildCommitGraph } from "./stackUtils";
import { describe, it, expect } from 'vitest';

describe('buildCommitGraph', () => {
  const sampleCommits: Commit[] = [
    {
      id: createCommitId('1111111111111111111111111111111111111111'),
      changeId: createChangeId('change0001'),
      description: createDescription('First commit'),
      author: { name: 'Author', email: createEmail('author@example.com') },
      timestamp: new Date('2025-10-13 21:00:00.000 +00:00'),
      parents: [],
      hasConflicts: false,
    },
    {
      id: createCommitId('2222222222222222222222222222222222222222'),
      changeId: createChangeId('change0002'),
      description: createDescription('Second commit'),
      author: { name: 'Author', email: createEmail('author@example.com') },
      timestamp: new Date('2025-10-13 21:01:00.000 +00:00'),
      parents: [createCommitId('1111111111111111111111111111111111111111')],
      hasConflicts: false,
    },
    {
      id: createCommitId('3333333333333333333333333333333333333333'),
      changeId: createChangeId('change0003'),
      description: createDescription('Third commit'),
      author: { name: 'Author', email: createEmail('author@example.com') },
      timestamp: new Date('2025-10-13 21:02:00.000 +00:00'),
      parents: [createCommitId('2222222222222222222222222222222222222222')],
      hasConflicts: false,
    },
  ];

  it('should build correct parent-child relationships', () => {
    const graph = buildCommitGraph(sampleCommits);
    
    expect(Object.keys(graph).length).toBe(3);
    
    const commit1Id = createCommitId('1111111111111111111111111111111111111111');
    const commit2Id = createCommitId('2222222222222222222222222222222222222222');
    const commit3Id = createCommitId('3333333333333333333333333333333333333333');
    
    // commit1 should have commit2 as child
    expect(graph[commit1Id]?.children).toEqual([commit2Id]);
    
    // commit2 should have commit3 as child
    expect(graph[commit2Id]?.children).toEqual([commit3Id]);
    
    // commit3 should have no children
    expect(graph[commit3Id]?.children).toEqual([]);
  });

  it('should handle merge commits with multiple parents', () => {
    const mergeCommits: Commit[] = [
      {
        id: createCommitId('1111111111111111111111111111111111111111'),
        changeId: createChangeId('change0001'),
        description: createDescription('First commit'),
        author: { name: 'Author', email: createEmail('author@example.com') },
        timestamp: new Date('2025-10-13 21:00:00.000 +00:00'),
        parents: [],
        hasConflicts: false,
      },
      {
        id: createCommitId('2222222222222222222222222222222222222222'),
        changeId: createChangeId('change0002'),
        description: createDescription('Second commit'),
        author: { name: 'Author', email: createEmail('author@example.com') },
        timestamp: new Date('2025-10-13 21:01:00.000 +00:00'),
        parents: [],
        hasConflicts: false,
      },
      {
        id: createCommitId('3333333333333333333333333333333333333333'),
        changeId: createChangeId('change0003'),
        description: createDescription('Merge commit'),
        author: { name: 'Author', email: createEmail('author@example.com') },
        timestamp: new Date('2025-10-13 21:02:00.000 +00:00'),
        parents: [
          createCommitId('1111111111111111111111111111111111111111'),
          createCommitId('2222222222222222222222222222222222222222')
        ],
        hasConflicts: false,
      },
    ];

    const graph = buildCommitGraph(mergeCommits);
    
    const commit1Id = createCommitId('1111111111111111111111111111111111111111');
    const commit2Id = createCommitId('2222222222222222222222222222222222222222');
    const commit3Id = createCommitId('3333333333333333333333333333333333333333');
    
    // Both commit1 and commit2 should have merge1 as child
    expect(graph[commit1Id]?.children).toEqual([commit3Id]);
    expect(graph[commit2Id]?.children).toEqual([commit3Id]);
    expect(graph[commit3Id]?.children).toEqual([]);
  });

  it('should handle empty commit list', () => {
    const graph = buildCommitGraph([]);
    
    expect(Object.keys(graph).length).toBe(0);
  });

  it('should handle commits with non-existent parents', () => {
    const commitsWithMissingParent: Commit[] = [
      {
        id: createCommitId('1111111111111111111111111111111111111111'),
        changeId: createChangeId('change0001'),
        description: createDescription('Commit with missing parent'),
        author: { name: 'Author', email: createEmail('author@example.com') },
        timestamp: new Date('2025-10-13 21:00:00.000 +00:00'),
        parents: [createCommitId('9999999999999999999999999999999999999999')],
        hasConflicts: false,
      },
    ];

    const graph = buildCommitGraph(commitsWithMissingParent);
    
    expect(Object.keys(graph).length).toBe(1);
    const commitId = createCommitId('1111111111111111111111111111111111111111');
    expect(graph[commitId]?.children).toEqual([]);
    // Should not crash when parent doesn't exist
  });
});
