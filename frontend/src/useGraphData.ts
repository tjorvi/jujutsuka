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
  const isOptimistic = useGraphStore(state => state.isOptimistic);
  const commitGraph = useGraphStore(state => state.commitGraph);
  
  // Sync successful queries to the store
  useEffect(() => {
    if (graphQuery.kind === 'success') {
      setCommitGraph(graphQuery.data);
    }
  }, [graphQuery, setCommitGraph]);

  // Compute stack graph from commit graph (memoized)
  const stackGraph = useMemo(() => {
    if (!commitGraph) return null;
    
    // Extract commits from the commit graph
    const commits = Object.values(commitGraph).map(node => node.commit);
    
    // Build stack graph using the same logic as backend
    const rawStackGraph = buildStackGraph(commits);
    
    // Enhance with layout information
    const layoutStackGraph = enhanceStackGraphForLayout(rawStackGraph);
    
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
    isOptimistic,
    error: hasError ? graphQuery.error : null,
    stackGraph,
    commitGraph,
  };
}