import { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Commit, CommitId } from "../../backend/src/repo-parser";

// Custom commit node component
function CommitNode({ data }: { data: { commit: Commit } }) {
  const { commit } = data;
  
  return (
    <div style={{
      padding: '10px',
      border: '2px solid #3b82f6',
      borderRadius: '8px',
      background: 'white',
      minWidth: '200px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    }}>
      <Handle type="target" position={Position.Top} />
      <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
        {commit.id.slice(0, 8)}
      </div>
      <div style={{ fontSize: '14px', marginBottom: '4px', lineHeight: '1.2' }}>
        {commit.description}
      </div>
      <div style={{ fontSize: '10px', color: '#666' }}>
        {commit.author.name}
      </div>
      <div style={{ fontSize: '10px', color: '#666' }}>
        {commit.timestamp.toLocaleDateString()}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = {
  commit: CommitNode,
};

// Layout algorithm for positioning nodes
function layoutGraph(graph: Record<CommitId, { commit: Commit; children: CommitId[] }>) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const positions = new Map<CommitId, { x: number; y: number; level: number }>();
  
  // Find root commits (commits with no parents in the current graph)
  const commitIds = Object.keys(graph) as CommitId[];
  const hasParentInGraph = new Set<CommitId>();
  
  for (const commitId of commitIds) {
    const commit = graph[commitId].commit;
    for (const parentId of commit.parents) {
      if (graph[parentId]) {
        hasParentInGraph.add(commitId);
      }
    }
  }
  
  const rootCommits = commitIds.filter(id => !hasParentInGraph.has(id));
  
  // Sort commits by timestamp (newest first)
  const sortedCommits = [...commitIds].sort((a, b) => 
    graph[b].commit.timestamp.getTime() - graph[a].commit.timestamp.getTime()
  );
  
  // Simple vertical layout based on timestamp
  const verticalSpacing = 120;
  const horizontalSpacing = 250;
  
  // Group commits by branches (simplified approach)
  const visited = new Set<CommitId>();
  let currentX = 0;
  
  function layoutBranch(commitId: CommitId, x: number, startY: number): number {
    if (visited.has(commitId)) return startY;
    visited.add(commitId);
    
    let currentY = startY;
    const commit = graph[commitId];
    
    // Position this commit
    positions.set(commitId, { x, y: currentY, level: 0 });
    
    // Layout children
    const children = commit.children.filter(childId => graph[childId]);
    for (let i = 0; i < children.length; i++) {
      const childY = layoutBranch(children[i], x + (i * horizontalSpacing), currentY + verticalSpacing);
      currentY = Math.max(currentY, childY);
    }
    
    return currentY;
  }
  
  // Layout each root commit and its descendants
  let maxY = 0;
  for (let i = 0; i < rootCommits.length; i++) {
    const rootId = rootCommits[i];
    if (!visited.has(rootId)) {
      const branchY = layoutBranch(rootId, currentX, maxY);
      maxY = Math.max(maxY, branchY + verticalSpacing);
      currentX += horizontalSpacing;
    }
  }
  
  // Handle any remaining commits (in case of cycles or disconnected components)
  for (const commitId of sortedCommits) {
    if (!visited.has(commitId)) {
      positions.set(commitId, { 
        x: currentX, 
        y: maxY, 
        level: 0 
      });
      currentX += horizontalSpacing;
    }
  }
  
  // Create nodes
  for (const commitId of commitIds) {
    const position = positions.get(commitId);
    if (position) {
      nodes.push({
        id: commitId,
        type: 'commit',
        position: { x: position.x, y: position.y },
        data: { commit: graph[commitId].commit },
      });
    }
  }
  
  // Create edges (parent -> child relationships)
  for (const commitId of commitIds) {
    const commit = graph[commitId].commit;
    for (const parentId of commit.parents) {
      if (graph[parentId]) {
        edges.push({
          id: `${parentId}-${commitId}`,
          source: parentId,
          target: commitId,
          type: 'straight',
          style: { stroke: '#3b82f6', strokeWidth: 2 },
          markerEnd: {
            type: 'arrowclosed',
            color: '#3b82f6',
          },
        });
      }
    }
  }
  
  return { nodes, edges };
}

export function CommitGraph({ graph }: { graph: Record<CommitId, { commit: Commit; children: CommitId[] }> }) {
  const { nodes, edges } = useMemo(() => layoutGraph(graph), [graph]);
  
  // Debug logging
  console.log('CommitGraph render:', { 
    graphKeys: Object.keys(graph), 
    nodesCount: nodes.length, 
    edgesCount: edges.length,
    nodes: nodes.slice(0, 3), // Log first 3 nodes for debugging
    edges: edges.slice(0, 3)   // Log first 3 edges for debugging
  });
  
  // Temporary: show raw data if no nodes are generated
  if (nodes.length === 0) {
    return (
      <div style={{ 
        height: '400px', 
        padding: '20px',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        background: '#f9fafb',
        overflow: 'auto'
      }}>
        <h3>Debug: Raw Graph Data</h3>
        <pre style={{ fontSize: '12px', whiteSpace: 'pre-wrap' }}>
          {JSON.stringify(graph, null, 2)}
        </pre>
      </div>
    );
  }
  
  if (Object.keys(graph).length === 0) {
    return (
      <div style={{ 
        height: '400px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        background: '#f9fafb'
      }}>
        <p style={{ color: '#6b7280' }}>No commits to display</p>
      </div>
    );
  }
  
  return (
    <div style={{ height: '600px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
      {/* Debug info */}
      <div style={{ padding: '10px', background: '#f3f4f6', fontSize: '12px' }}>
        Nodes: {nodes.length}, Edges: {edges.length}
      </div>
      
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
      >
        <Background gap={20} size={1} />
        <Controls />
        <MiniMap 
          nodeColor="#3b82f6"
          nodeStrokeWidth={3}
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}
