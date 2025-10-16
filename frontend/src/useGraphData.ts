import { useEffect, useMemo } from 'react';
import { queries, useQuery } from './api';
import { useGraphStore } from './graphStore';
import { buildStackGraph, enhanceStackGraphForLayout } from "./stackUtils";

/**
 * Hook that manages fetching graph data and computing stack graph
 */
export function useGraphData() {
  const graphQuery = useQuery(queries.graph, undefined);
  const setCommitGraph = useGraphStore(state => state.setCommitGraph);
  const isExecutingCommand = useGraphStore(state => state.isExecutingCommand);
  const commitGraph = useGraphStore(state => state.commitGraph);
  
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