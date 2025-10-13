import { useMemo } from 'react';
import type { Stack, StackId, CommitId, Commit } from "../../backend/src/repo-parser";
import type { ParallelGroup, LayoutStackGraph } from "../../backend/src/layout-utils";

interface StackComponentProps {
  stack: Stack;
  commitGraph: Record<CommitId, { commit: Commit; children: CommitId[] }>;
  isInParallelGroup?: boolean;
}

function StackComponent({ stack, commitGraph, isInParallelGroup = false }: StackComponentProps) {
  return (
    <div style={{
      border: isInParallelGroup ? '2px solid #a855f7' : '2px solid #3b82f6',
      borderRadius: '8px',
      background: 'white',
      margin: isInParallelGroup ? '4px' : '8px',
      padding: '12px',
      minWidth: '200px',
      boxShadow: isInParallelGroup 
        ? '0 2px 8px rgba(168, 85, 247, 0.1)' 
        : '0 2px 10px rgba(0,0,0,0.1)',
    }}>
      <div style={{ 
        fontSize: '12px', 
        fontWeight: 'bold', 
        marginBottom: '8px',
        color: isInParallelGroup ? '#7c3aed' : '#6b7280'
      }}>
        {stack.commits.length} commit{stack.commits.length > 1 ? 's' : ''}
      </div>
      
      {stack.commits.slice().reverse().map((commitId, index) => {
        const commit = commitGraph[commitId]?.commit;
        if (!commit) return null;
        
        return (
          <div key={commitId} style={{
            padding: '8px',
            marginBottom: index < stack.commits.length - 1 ? '4px' : '0',
            background: '#f8fafc',
            borderRadius: '4px',
            borderLeft: isInParallelGroup 
              ? '3px solid #a855f7' 
              : '3px solid #3b82f6',
          }}>
            <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#6b7280' }}>
              {commitId.slice(0, 8)}
            </div>
            <div style={{ fontSize: '13px', margin: '2px 0', color: '#374151' }}>
              {commit.description}
            </div>
            <div style={{ fontSize: '10px', color: '#9ca3af' }}>
              {commit.author.name} • {commit.timestamp.toLocaleDateString()}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface ConnectionComponentProps {
  connection: {
    from: StackId;
    to: StackId;
    type: 'linear' | 'merge' | 'branch';
  };
}

function ConnectionComponent({ connection }: ConnectionComponentProps) {
  const getConnectionColor = (type: string) => {
    switch (type) {
      case 'merge': return '#ef4444'; // red
      case 'branch': return '#f59e0b'; // amber
      case 'linear': return '#3b82f6'; // blue
      default: return '#6b7280'; // gray
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      margin: '4px 0',
      fontSize: '11px',
      color: getConnectionColor(connection.type),
    }}>
      <span>{connection.from}</span>
      <span style={{ margin: '0 8px' }}>
        {connection.type === 'merge' && '🔀'}
        {connection.type === 'branch' && '🌿'}
        {connection.type === 'linear' && '➡️'}
      </span>
      <span>{connection.to}</span>
      <span style={{ marginLeft: '8px', fontWeight: 'bold' }}>
        ({connection.type})
      </span>
    </div>
  );
}

export function StackGraphComponent({ stackGraph, commitGraph }: { 
  stackGraph: LayoutStackGraph;
  commitGraph: Record<CommitId, { commit: Commit; children: CommitId[] }>;
}) {
  const { stacks, connections, rootStacks, leafStacks, parallelGroups } = stackGraph;
  
  // Create a map to quickly find which parallel group a stack belongs to
  const stackToGroup = useMemo(() => {
    const map = new Map<StackId, ParallelGroup>();
    parallelGroups.forEach(group => {
      group.stackIds.forEach(stackId => {
        map.set(stackId, group);
      });
    });
    return map;
  }, [parallelGroups]);
  
  // Group stacks and parallel groups into columns for better layout
  const layoutLevels = useMemo(() => {
    type LayoutItem = { type: 'stack'; stackId: StackId; isParallel?: boolean; parallelGroupId?: string };
    const levels: LayoutItem[][] = [];
    const visited = new Set<StackId>();
    
    // Start with root stacks
    const queue: { item: LayoutItem; level: number }[] = [];
    
    // Add root stacks to queue
    rootStacks.forEach(stackId => {
      queue.push({ item: { type: 'stack', stackId }, level: 0 });
      visited.add(stackId);
    });
    
    while (queue.length > 0) {
      const { item, level } = queue.shift()!;
      
      // Ensure we have this level
      while (levels.length <= level) {
        levels.push([]);
      }
      
      levels[level].push(item);
      
      // Add children to next level
      const stack = stacks[item.stackId];
      for (const childId of stack.childStacks) {
        if (!visited.has(childId)) {
          // Check if this child is part of a parallel group
          const parallelGroup = stackToGroup.get(childId);
          const isParallel = !!parallelGroup;
          
          queue.push({ 
            item: { 
              type: 'stack', 
              stackId: childId, 
              isParallel,
              parallelGroupId: parallelGroup?.id 
            }, 
            level: level + 1 
          });
          visited.add(childId);
        }
      }
    }
    
    return levels;
  }, [stacks, rootStacks, stackToGroup]);

  if (Object.keys(stacks).length === 0) {
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
        <p style={{ color: '#6b7280' }}>No stacks to display</p>
      </div>
    );
  }

  return (
    <div style={{ 
      padding: '20px',
      border: '1px solid #e5e7eb', 
      borderRadius: '8px',
      background: '#fafafa'
    }}>
      {/* Header with summary */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '20px', color: '#111827' }}>
          📚 Commit Stack Graph
        </h2>
      </div>

      {/* Stack layout - vertical flow, newest on top */}
      <div style={{ 
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        overflowY: 'auto',
        maxHeight: '80vh',
      }}>
        {layoutLevels.slice().reverse().map((level, levelIndex) => {
          const actualLevelIndex = layoutLevels.length - 1 - levelIndex;
          return (
          <div key={actualLevelIndex}>
            {/* Stacks in this level - horizontal layout, centered */}
            <div style={{
              display: 'flex',
              gap: '16px',
              flexWrap: 'wrap',
              alignItems: 'flex-start',
              justifyContent: 'center',
              position: 'relative',
              marginBottom: '20px',
            }}>
              {level.map((item) => {
                const stack = stacks[item.stackId];
                
                return (
                  <div key={item.stackId} style={{ position: 'relative', minWidth: '280px' }}>
                    <StackComponent 
                      stack={stack} 
                      commitGraph={commitGraph}
                      isInParallelGroup={item.isParallel}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );})}
      </div>

      {/* Connections summary - simplified */}
      {connections.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <details style={{ 
            background: 'white',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            padding: '16px',
          }}>
            <summary style={{ 
              fontSize: '14px', 
              fontWeight: '600', 
              color: '#374151',
              cursor: 'pointer',
              marginBottom: '8px',
            }}>
              View All Connections ({connections.length})
            </summary>
            <div style={{ 
              display: 'flex', 
              flexWrap: 'wrap', 
              gap: '8px',
              maxHeight: '200px',
              overflowY: 'auto',
              marginTop: '12px',
            }}>
              {connections.map((connection, index) => (
                <ConnectionComponent key={index} connection={connection} />
              ))}
            </div>
          </details>
        </div>
      )}

      {/* Debug info - less prominent */}
      <details style={{ 
        marginTop: '16px',
        fontSize: '11px',
        color: '#9ca3af',
      }}>
        <summary style={{ cursor: 'pointer', fontSize: '12px' }}>
          Debug Info
        </summary>
        <div style={{ 
          fontFamily: 'monospace',
          marginTop: '8px',
          padding: '8px',
          background: '#f9fafb',
          borderRadius: '4px',
        }}>
          Root stacks: {rootStacks.join(', ')}<br/>
          Leaf stacks: {leafStacks.join(', ')}
        </div>
      </details>
    </div>
  );
}