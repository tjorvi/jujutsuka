import { useMemo } from 'react';
import type { StackGraph, Stack, StackId, CommitId, Commit } from "../../backend/src/repo-parser";

interface StackComponentProps {
  stack: Stack;
  commitGraph: Record<CommitId, { commit: Commit; children: CommitId[] }>;
}

function StackComponent({ stack, commitGraph }: StackComponentProps) {
  return (
    <div style={{
      border: '2px solid #3b82f6',
      borderRadius: '8px',
      background: 'white',
      margin: '8px',
      padding: '12px',
      minWidth: '200px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    }}>
      <div style={{ 
        fontSize: '12px', 
        fontWeight: 'bold', 
        marginBottom: '8px',
        color: '#6b7280'
      }}>
        Stack {stack.id} ({stack.commits.length} commits)
      </div>
      
      {stack.commits.map((commitId, index) => {
        const commit = commitGraph[commitId]?.commit;
        if (!commit) return null;
        
        return (
          <div key={commitId} style={{
            padding: '8px',
            marginBottom: index < stack.commits.length - 1 ? '4px' : '0',
            background: '#f8fafc',
            borderRadius: '4px',
            borderLeft: '3px solid #3b82f6',
          }}>
            <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#6b7280' }}>
              {commitId.slice(0, 8)}
            </div>
            <div style={{ fontSize: '13px', margin: '2px 0' }}>
              {commit.description}
            </div>
            <div style={{ fontSize: '10px', color: '#9ca3af' }}>
              {commit.author.name} • {commit.timestamp.toLocaleDateString()}
            </div>
          </div>
        );
      })}
      
      {/* Show stack relationships */}
      {(stack.parentStacks.length > 0 || stack.childStacks.length > 0) && (
        <div style={{ 
          marginTop: '8px', 
          fontSize: '10px', 
          color: '#6b7280',
          borderTop: '1px solid #e5e7eb',
          paddingTop: '4px'
        }}>
          {stack.parentStacks.length > 0 && (
            <div>⬆️ Parents: {stack.parentStacks.join(', ')}</div>
          )}
          {stack.childStacks.length > 0 && (
            <div>⬇️ Children: {stack.childStacks.join(', ')}</div>
          )}
        </div>
      )}
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
  stackGraph: StackGraph;
  commitGraph: Record<CommitId, { commit: Commit; children: CommitId[] }>;
}) {
  const { stacks, connections, rootStacks, leafStacks } = stackGraph;
  
  // Group stacks into columns for better layout
  const stackLevels = useMemo(() => {
    const levels: StackId[][] = [];
    const visited = new Set<StackId>();
    
    // Start with root stacks
    const queue: { stackId: StackId; level: number }[] = 
      rootStacks.map(id => ({ stackId: id, level: 0 }));
    
    while (queue.length > 0) {
      const { stackId, level } = queue.shift()!;
      
      if (visited.has(stackId)) continue;
      visited.add(stackId);
      
      // Ensure we have this level
      while (levels.length <= level) {
        levels.push([]);
      }
      
      levels[level].push(stackId);
      
      // Add children to next level
      const stack = stacks[stackId];
      for (const childId of stack.childStacks) {
        if (!visited.has(childId)) {
          queue.push({ stackId: childId, level: level + 1 });
        }
      }
    }
    
    return levels;
  }, [stacks, rootStacks]);

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
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: '18px' }}>
          Commit Stack Graph
        </h2>
        <div style={{ fontSize: '14px', color: '#6b7280' }}>
          {Object.keys(stacks).length} stacks • {connections.length} connections
        </div>
      </div>

      {/* Stack layout */}
      <div style={{ 
        display: 'flex', 
        gap: '20px',
        overflowX: 'auto',
        minHeight: '400px'
      }}>
        {stackLevels.map((level, levelIndex) => (
          <div key={levelIndex} style={{ 
            display: 'flex',
            flexDirection: 'column',
            minWidth: '220px'
          }}>
            <div style={{ 
              fontSize: '12px', 
              fontWeight: 'bold', 
              marginBottom: '12px',
              color: '#6b7280'
            }}>
              Level {levelIndex}
            </div>
            {level.map(stackId => (
              <StackComponent 
                key={stackId} 
                stack={stacks[stackId]} 
                commitGraph={commitGraph}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Connections summary */}
      {connections.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <h3 style={{ fontSize: '14px', marginBottom: '8px', color: '#374151' }}>
            Connections
          </h3>
          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: '8px',
            maxHeight: '200px',
            overflowY: 'auto',
            padding: '8px',
            background: 'white',
            borderRadius: '4px',
            border: '1px solid #e5e7eb'
          }}>
            {connections.map((connection, index) => (
              <ConnectionComponent key={index} connection={connection} />
            ))}
          </div>
        </div>
      )}

      {/* Debug info */}
      <div style={{ 
        marginTop: '16px', 
        fontSize: '11px', 
        color: '#9ca3af',
        fontFamily: 'monospace'
      }}>
        Root stacks: {rootStacks.join(', ')} • Leaf stacks: {leafStacks.join(', ')}
      </div>
    </div>
  );
}