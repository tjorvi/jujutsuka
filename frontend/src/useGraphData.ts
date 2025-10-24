import { useEffect, useEffectEvent, useMemo } from 'react';
import { useSubscription, failed, succeeded, subscriptions } from './api';
import { useGraphStore } from './graphStore';
import { buildStackGraph, enhanceStackGraphForLayout } from "./stackUtils";
import type { Commit, CommitId } from '../../backend/src/repo-parser';


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
 * Hook that manages fetching graph data and computing stack graph
 */
export function useGraphData() {
  const repoPath = useGraphStore(state => state.repoPath);
  const setCommitGraph = useGraphStore(state => state.setCommitGraph);
  const isExecutingCommand = useGraphStore(state => state.isExecutingCommand);
  const commitGraph = useGraphStore(state => state.commitGraph);

  const commitsSubscription = useSubscription(subscriptions.watchRepoChanges, { repoPath });

  const onNewGraph = useEffectEvent((commits: Commit[]) => {
    console.log('📊 Syncing query data to store');
    const builtGraph = buildCommitGraph(commits);
    setCommitGraph(builtGraph);
  });

  useEffect(() => {
    if (commitsSubscription.kind === 'success') {
      const repo = commitsSubscription.data;
      console.log(`📥 Received ${repo.commits.length} commits from subscription, op head ${repo.opHead}`);
      onNewGraph(repo.commits);
    }
  }, [commitsSubscription]); // eslint is confused here, according to the docs useEffectEvent shouldn't be listed

  const stackGraph = useMemo(() => {
    console.log('🔧 useGraphData: useMemo triggered, commitGraph:', !!commitGraph);
    if (!commitGraph) return null;
    
    // Extract commits from the commit graph
    const commits = Object.values(commitGraph).map(node => node.commit);
    console.log('🔧 useGraphData: Building stack graph from', commits.length, 'commits');
    
    // Build stack graph using the same logic as backend
    const rawStackGraph = buildStackGraph(commits);
    
    // Log detailed stack graph structure
    console.log('\n📊 Frontend Stack Graph:');
    for (const [stackId, stack] of Object.entries(rawStackGraph.stacks)) {
      const commitDescs = stack.commits.map(cid => {
        const node = commitGraph[cid];
        return node ? node.commit.description.substring(0, 40) : cid.substring(0, 8);
      }).join(', ');
      console.log(`  ${stackId}: [${stack.commits.length} commit${stack.commits.length > 1 ? 's' : ''}] ${commitDescs}`);
      if (stack.parentStacks.length > 0) {
        console.log(`    ↑ from: ${stack.parentStacks.join(', ')}`);
      }
      if (stack.childStacks.length > 0) {
        console.log(`    ↓ to: ${stack.childStacks.join(', ')}`);
      }
    }
    console.log('');
    
    console.log('🔧 useGraphData: Raw stack graph:', {
      stacks: Object.keys(rawStackGraph.stacks).length,
      connections: rawStackGraph.connections.length,
      rootStacks: rawStackGraph.rootStacks.length,
      leafStacks: rawStackGraph.leafStacks.length
    });
    console.log('🔧 useGraphData: Connections:', rawStackGraph.connections);
    
    // Enhance with layout information
    const layoutStackGraph = enhanceStackGraphForLayout(rawStackGraph);
    console.log('🔧 useGraphData: Enhanced with parallel groups:', layoutStackGraph.parallelGroups.length);
    console.log('🔧 useGraphData: Parallel groups:', layoutStackGraph.parallelGroups);
    
    return layoutStackGraph;
  }, [commitGraph]);

  // Determine loading and error states
  const isLoading = commitsSubscription.kind === 'loading';
  const hasError = failed(commitsSubscription);
  const isSuccess = succeeded(commitsSubscription);

  return {
    isLoading,
    hasError,
    isSuccess,
    isExecutingCommand,
    error: hasError ? commitsSubscription.error : null,
    stackGraph,
    commitGraph,
  };
}
