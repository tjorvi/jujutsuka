import { useEffect, useEffectEvent, useMemo } from 'react';
import { useSubscription, failed, succeeded, subscriptions, trpc } from './api';
import { useGraphStore } from './graphStore';
import { buildStackGraph, enhanceStackGraphForLayout } from "./stackUtils";
import type { Bookmark, ChangeId, Commit, CommitId } from '../../backend/src/repo-parser';


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

function findDivergentChangeIds(commits: Commit[]): ReadonlySet<ChangeId> {
  const counts = new Map<ChangeId, number>();
  for (const commit of commits) {
    const currentCount = counts.get(commit.changeId) ?? 0;
    counts.set(commit.changeId, currentCount + 1);
  }

  const divergent = new Set<ChangeId>();
  for (const [changeId, count] of counts.entries()) {
    if (count > 1) {
      divergent.add(changeId);
    }
  }

  return divergent;
}

/**
 * Hook that manages fetching graph data and computing stack graph
 */
export function useGraphData() {
  const repoPath = useGraphStore(state => state.repoPath);
  const setCommitGraph = useGraphStore(state => state.setCommitGraph);
  const setCurrentCommitId = useGraphStore(state => state.setCurrentCommitId);
  const setOperationLog = useGraphStore(state => state.setOperationLog);
  const isExecutingCommand = useGraphStore(state => state.isExecutingCommand);
  const commitGraph = useGraphStore(state => state.commitGraph);
  const setDivergentChangeIds = useGraphStore(state => state.setDivergentChangeIds);
  const setBookmarks = useGraphStore(state => state.setBookmarks);

  const commitsSubscription = useSubscription(
    subscriptions.watchRepoChanges,
    { repoPath },
    { enabled: repoPath.trim().length > 0 }
  );

  const onNewGraph = useEffectEvent((payload: { commits: Commit[]; currentCommitId: CommitId | null; bookmarks?: Bookmark[] }) => {
    console.log('📊 Syncing query data to store');
    const divergentChangeIds = findDivergentChangeIds(payload.commits);
    const builtGraph = buildCommitGraph(payload.commits);
    setCommitGraph(builtGraph);
    setCurrentCommitId(payload.currentCommitId);
    setDivergentChangeIds(divergentChangeIds);
    setBookmarks(payload.bookmarks ?? []);
  });

  useEffect(() => {
    if (commitsSubscription.kind === 'success') {
      const repo = commitsSubscription.data;
      console.log(`📥 Received ${repo.commits.length} commits from subscription, op head ${repo.opHead}`);
      onNewGraph({ commits: repo.commits, currentCommitId: repo.currentCommitId, bookmarks: repo.bookmarks });

      // Fetch operation log whenever the repo changes
      if (repoPath) {
        trpc.operationLog.query({ repoPath }).then((opLog) => {
          console.log('📋 Fetched operation log:', opLog.length, 'entries');
          setOperationLog(opLog);
        }).catch((error) => {
          console.error('❌ Failed to fetch operation log:', error);
        });
      }
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
