import { describe, expect, test } from 'vitest';
import { 
  createCommitId, 
  createChangeId,
  createEmail, 
  createDescription, 
  type Commit 
} from '../../backend/src/repo-parser';
import { buildStackGraph } from './stackUtils.ts';

describe('Stack Preprocessing', () => {
  // Helper to create test commits
  function createTestCommit(
    id: string, 
    description: string, 
    parents: string[] = [],
    timestamp = new Date('2024-01-01')
  ): Commit {
    return {
      id: createCommitId(id.padEnd(40, '0')),
      changeId: createChangeId(id.padEnd(12, '0')), // Use shorter change ID based on commit ID
      description: createDescription(description),
      author: {
        name: 'Test Author',
        email: createEmail('test@example.com'),
      },
      timestamp,
      parents: parents.map(p => createCommitId(p.padEnd(40, '0'))),
    };
  }

  test('single linear chain creates one stack', () => {
    const commits = [
      createTestCommit('a', 'Initial commit'),
      createTestCommit('b', 'Second commit', ['a']),
      createTestCommit('c', 'Third commit', ['b']),
    ];

    const stackGraph = buildStackGraph(commits);
    
    expect(Object.keys(stackGraph.stacks)).toHaveLength(1);
    expect(stackGraph.connections).toHaveLength(0);
    expect(stackGraph.rootStacks).toHaveLength(1);
    expect(stackGraph.leafStacks).toHaveLength(1);
    
    const stack = Object.values(stackGraph.stacks)[0];
    expect(stack.commits).toHaveLength(3);
    expect(stack.parentStacks).toHaveLength(0);
    expect(stack.childStacks).toHaveLength(0);
  });

  test('simple branch creates two stacks with connection', () => {
    const commits = [
      createTestCommit('a', 'Initial commit'),
      createTestCommit('b', 'Main branch', ['a']),
      createTestCommit('c', 'Feature branch', ['a']),
    ];

    const stackGraph = buildStackGraph(commits);
    
    expect(Object.keys(stackGraph.stacks)).toHaveLength(3);
    expect(stackGraph.connections).toHaveLength(2);
    expect(stackGraph.rootStacks).toHaveLength(1);
    expect(stackGraph.leafStacks).toHaveLength(2);
  });

  test('merge creates multiple stacks with merge connection', () => {
    const commits = [
      createTestCommit('a', 'Initial commit'),
      createTestCommit('b', 'Main branch', ['a']),
      createTestCommit('c', 'Feature branch', ['a']),
      createTestCommit('d', 'Merge commit', ['b', 'c']),
    ];

    const stackGraph = buildStackGraph(commits);
    
    // Should have 4 stacks: one for each commit (since they're all special commits)
    expect(Object.keys(stackGraph.stacks)).toHaveLength(4);
    
    // Should have 4 connections: a->b, a->c, b->d, c->d
    expect(stackGraph.connections).toHaveLength(4);
    
    // Find the merge connections (there should be two: b->d and c->d)
    const mergeConnections = stackGraph.connections.filter(conn => conn.type === 'merge');
    expect(mergeConnections).toHaveLength(2);
    
    // Find the branch connections (there should be two: a->b and a->c)
    const branchConnections = stackGraph.connections.filter(conn => conn.type === 'branch');
    expect(branchConnections).toHaveLength(2);
  });

  test('complex DAG with multiple branches and merges', () => {
    const commits = [
      createTestCommit('a', 'Initial commit'),
      createTestCommit('b', 'Main 1', ['a']),
      createTestCommit('c', 'Main 2', ['b']),
      createTestCommit('d', 'Feature 1', ['a']),
      createTestCommit('e', 'Feature 2', ['d']),
      createTestCommit('f', 'Merge feature', ['c', 'e']),
      createTestCommit('g', 'Main 3', ['f']),
    ];

    const stackGraph = buildStackGraph(commits);
    
    // Should have multiple stacks
    expect(Object.keys(stackGraph.stacks).length).toBeGreaterThan(3);
    
    // Should have connections
    expect(stackGraph.connections.length).toBeGreaterThan(0);
    
    // Should have one root stack (containing 'a')
    expect(stackGraph.rootStacks).toHaveLength(1);
    
    // Should have one leaf stack (containing 'g')
    expect(stackGraph.leafStacks).toHaveLength(1);
  });

  test('stack ordering is correct (oldest to newest)', () => {
    const commits = [
      createTestCommit('a', 'First', [], new Date('2024-01-01')),
      createTestCommit('b', 'Second', ['a'], new Date('2024-01-02')),
      createTestCommit('c', 'Third', ['b'], new Date('2024-01-03')),
    ];

    const stackGraph = buildStackGraph(commits);
    const stack = Object.values(stackGraph.stacks)[0];
    
    // Commits should be ordered from oldest to newest
    expect(stack.commits[0]).toBe(createCommitId('a'.padEnd(40, '0')));
    expect(stack.commits[1]).toBe(createCommitId('b'.padEnd(40, '0')));
    expect(stack.commits[2]).toBe(createCommitId('c'.padEnd(40, '0')));
  });

  test('real-world scenario: feature branch with linear commits', () => {
    const commits = [
      createTestCommit('a', 'Initial commit'),
      createTestCommit('b', 'Add basic structure', ['a']),
      createTestCommit('c', 'Add feature 1', ['b']),
      createTestCommit('d', 'Add feature 2', ['c']),
      createTestCommit('e', 'Fix bug', ['d']),
      createTestCommit('f', 'Main branch work', ['a']),
      createTestCommit('g', 'Merge feature branch', ['f', 'e']),
    ];

    const stackGraph = buildStackGraph(commits);
    
    // Should have fewer stacks than commits due to linear chains
    expect(Object.keys(stackGraph.stacks).length).toBeLessThan(commits.length);
    
    // Find the feature branch stack (should contain b, c, d, e)
    const featureStack = Object.values(stackGraph.stacks).find(
      stack => stack.commits.length > 1 && 
      stack.commits.includes(createCommitId('b'.padEnd(40, '0')))
    );
    expect(featureStack).toBeDefined();
    expect(featureStack!.commits).toHaveLength(4); // b, c, d, e
    
    // Should have merge connections
    const mergeConnections = stackGraph.connections.filter(conn => conn.type === 'merge');
    expect(mergeConnections.length).toBeGreaterThan(0);
  });
});