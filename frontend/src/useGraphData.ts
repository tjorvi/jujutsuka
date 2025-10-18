import { useEffect, useMemo } from 'react';
import { queries, useQuery, trpc } from './api';
import { useGraphStore } from './graphStore';
import { buildStackGraph, enhanceStackGraphForLayout } from "./stackUtils";

/**
 * Hook that manages fetching graph data and computing stack graph
 */
export function useGraphData() {
  const repoPath = useGraphStore(state => state.repoPath);
  const graphQuery = useQuery(queries.graph, { repoPath }, { enabled: !!repoPath });
  const setCommitGraph = useGraphStore(state => state.setCommitGraph);
  const refreshGraphData = useGraphStore(state => state.refreshGraphData);
  const isExecutingCommand = useGraphStore(state => state.isExecutingCommand);
  const commitGraph = useGraphStore(state => state.commitGraph);

  // Subscribe to repository changes via SSE
  useEffect(() => {
    if (!repoPath) return;

    console.log('🔔 Subscribing to repo changes for:', repoPath);
    const subscription = trpc.watchRepoChanges.subscribe(
      { repoPath },
      {
        onData: (data) => {
          console.log('🔔 Repo change detected, refreshing graph data', data);
          // Don't refresh if we're already executing a command
          // (command execution already triggers a refresh)
          if (!isExecutingCommand) {
            refreshGraphData();
          }
        },
        onError: (err) => {
          console.error('❌ Subscription error:', err);
        },
      }
    );

    return () => {
      console.log('🔕 Unsubscribing from repo changes');
      subscription.unsubscribe();
    };
  }, [repoPath, refreshGraphData, isExecutingCommand]);
  
  // Debug command execution state changes
  useEffect(() => {
    console.log('📊 useGraphData - isExecutingCommand changed:', isExecutingCommand);
    if (commitGraph) {
      console.log('📊 useGraphData - commitGraph keys:', Object.keys(commitGraph).length);
    }
  }, [isExecutingCommand, commitGraph]);

  // Sync successful queries to the store
  useEffect(() => {
    if (graphQuery.kind === 'success') {
      console.log('📊 Syncing query data to store');
      setCommitGraph(graphQuery.data);
    }
  }, [graphQuery, setCommitGraph]);  // Compute stack graph from commit graph (memoized)
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
  const isLoading = graphQuery.kind === 'loading';
  const hasError = graphQuery.kind === 'error';
  const isSuccess = graphQuery.kind === 'success';

  return {
    isLoading,
    hasError,
    isSuccess,
    isExecutingCommand,
    error: hasError ? graphQuery.error : null,
    stackGraph,
    commitGraph,
  };
}