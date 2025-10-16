import { describe, expect, test } from 'vitest';
import { 
  buildStackGraph,
  createCommitId,
  createChangeId, 
  createEmail, 
  createDescription, 
  type Commit 
} from './repo-parser';
import { detectParallelGroups, enhanceStackGraphForLayout } from './layout-utils';

describe('Layout Utils - Parallel Group Detection', () => {
  // Helper to create test commits
  function createTestCommit(
    id: string, 
    description: string, 
    parents: string[] = [],
    timestamp = new Date('2024-01-01')
  ): Commit {
    return {
      id: createCommitId(id.padEnd(40, '0')),
      changeId: createChangeId(id.padEnd(12, '0')),
      description: createDescription(description),
      author: {
        name: 'Test Author',
        email: createEmail('test@example.com'),
      },
      timestamp,
      parents: parents.map(p => createCommitId(p.padEnd(40, '0'))),
    };
  }

  test('detects diamond pattern as parallel group', () => {
    const commits = [
      createTestCommit('a', 'Initial commit', [], new Date('2024-01-01')),
      createTestCommit('b', 'Main 1', ['a'], new Date('2024-01-02')),
      createTestCommit('c', 'Main 2', ['b'], new Date('2024-01-03')),
      createTestCommit('d', 'Main 3', ['c'], new Date('2024-01-04')),
      createTestCommit('e', 'Feature 1', ['d'], new Date('2024-01-05')),
      createTestCommit('f', 'Feature 2', ['d'], new Date('2024-01-06')),
      createTestCommit('g', 'Merge both features', ['e', 'f'], new Date('2024-01-07')),
    ];

    const stackGraph = buildStackGraph(commits);
    const parallelGroups = detectParallelGroups(stackGraph);
    
    // Should detect one parallel group
    expect(parallelGroups).toHaveLength(1);
    
    const group = parallelGroups[0];
    expect(group.stackIds).toHaveLength(2);
    expect(group.isComplete).toBe(true);
  });

  test('does not detect non-diamonds as parallel groups', () => {
    const commits = [
      createTestCommit('a', 'Initial commit'),
      createTestCommit('b', 'Second commit', ['a']),
      createTestCommit('c', 'Third commit', ['b']),
    ];

    const stackGraph = buildStackGraph(commits);
    const parallelGroups = detectParallelGroups(stackGraph);
    
    // Should not detect any parallel groups
    expect(parallelGroups).toHaveLength(0);
  });

  test('enhanceStackGraphForLayout preserves original data', () => {
    const commits = [
      createTestCommit('a', 'Initial commit'),
      createTestCommit('b', 'Feature 1', ['a']),
      createTestCommit('c', 'Feature 2', ['a']),
      createTestCommit('d', 'Merge', ['b', 'c']),
    ];

    const originalStackGraph = buildStackGraph(commits);
    const enhancedStackGraph = enhanceStackGraphForLayout(originalStackGraph);
    
    // Original data should be preserved
    expect(enhancedStackGraph.stacks).toEqual(originalStackGraph.stacks);
    expect(enhancedStackGraph.connections).toEqual(originalStackGraph.connections);
    expect(enhancedStackGraph.rootStacks).toEqual(originalStackGraph.rootStacks);
    expect(enhancedStackGraph.leafStacks).toEqual(originalStackGraph.leafStacks);
    
    // Should have parallel groups added
    expect(enhancedStackGraph.parallelGroups).toHaveLength(1);
  });

  test('original stack graph is not mutated', () => {
    const commits = [
      createTestCommit('a', 'Initial commit'),
      createTestCommit('b', 'Feature 1', ['a']),
      createTestCommit('c', 'Feature 2', ['a']),
      createTestCommit('d', 'Merge', ['b', 'c']),
    ];

    const originalStackGraph = buildStackGraph(commits);
    const originalStackCount = Object.keys(originalStackGraph.stacks).length;
    const originalConnectionCount = originalStackGraph.connections.length;
    
    // Detect parallel groups
    detectParallelGroups(originalStackGraph);
    
    // Original should be unchanged
    expect(Object.keys(originalStackGraph.stacks)).toHaveLength(originalStackCount);
    expect(originalStackGraph.connections).toHaveLength(originalConnectionCount);
    expect('parallelGroups' in originalStackGraph).toBe(false);
  });
});