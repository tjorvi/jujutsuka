import { useMemo, useRef, useEffect, useState } from 'react';
import type { Stack, StackId, CommitId, Commit } from "../../backend/src/repo-parser";
import type { ParallelGroup, LayoutStackGraph } from "../../backend/src/layout-utils";

interface StackComponentProps {
  stack: Stack;
  commitGraph: Record<CommitId, { commit: Commit; children: CommitId[] }>;
  isInParallelGroup?: boolean;
  selectedCommitId?: CommitId;
  onCommitSelect: (commitId: CommitId) => void;
}

function StackComponent({ stack, commitGraph, isInParallelGroup = false, selectedCommitId, onCommitSelect }: StackComponentProps) {
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
        
        const isSelected = selectedCommitId === commitId;
        
        return (
          <div 
            key={commitId} 
            onClick={() => onCommitSelect(commitId)}
            style={{
              padding: '8px',
              marginBottom: index < stack.commits.length - 1 ? '4px' : '0',
              background: isSelected ? '#e0f2fe' : '#f8fafc',
              borderRadius: '4px',
              borderLeft: isSelected 
                ? '3px solid #0284c7'
                : isInParallelGroup 
                  ? '3px solid #a855f7' 
                  : '3px solid #3b82f6',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              border: isSelected ? '1px solid #0284c7' : '1px solid transparent',
            }}
          >
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

interface CurvedArrowProps {
  from: { x: number; y: number };
  to: { x: number; y: number };
  type: 'linear' | 'merge' | 'branch';
}

function CurvedArrow({ from, to, type }: CurvedArrowProps) {
  const getArrowColor = (type: string) => {
    switch (type) {
      case 'merge': return '#ef4444'; // red
      case 'branch': return '#f59e0b'; // amber
      case 'linear': return '#3b82f6'; // blue
      default: return '#6b7280'; // gray
    }
  };

  const getArrowWidth = (type: string) => {
    return type === 'linear' ? 2 : 3;
  };

  // Calculate control points for a smooth curve
  const dy = to.y - from.y;
  
  // For clean vertical entry/exit, make control points extend vertically from endpoints
  const verticalExtension = Math.max(Math.abs(dy) * 0.3, 40); // Minimum 40px vertical extension
  
  // Control points for vertical entry/exit
  const cp1x = from.x; // Stay directly above/below the start point
  const cp1y = from.y - verticalExtension; // Extend vertically upward from start
  const cp2x = to.x; // Stay directly above/below the end point  
  const cp2y = to.y + verticalExtension; // Extend vertically downward toward end

  const pathData = `M ${from.x} ${from.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${to.x} ${to.y}`;

  // Calculate arrow head angle - should point in the direction of travel
  const arrowSize = 8;
  
  // For UPWARD arrows (older to newer commits), arrows point UP
  // Move the entire arrowhead up slightly for better positioning
  const arrowOffset = 4; // Move up by 4 pixels
  const arrowPoint1x = to.x - arrowSize * 0.5; // Left wing
  const arrowPoint1y = to.y + arrowSize - arrowOffset; // Below the tip, moved up
  const arrowPoint2x = to.x + arrowSize * 0.5; // Right wing  
  const arrowPoint2y = to.y + arrowSize - arrowOffset; // Below the tip, moved up

  return (
    <g>
      <path
        d={pathData}
        stroke={getArrowColor(type)}
        strokeWidth={getArrowWidth(type)}
        fill="none"
        opacity={0.8}
        strokeDasharray={type === 'branch' ? '5,5' : undefined}
      />
      <polygon
        points={`${to.x},${to.y - arrowOffset} ${arrowPoint1x},${arrowPoint1y} ${arrowPoint2x},${arrowPoint2y}`}
        fill={getArrowColor(type)}
        opacity={0.8}
      />
    </g>
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

export function StackGraphComponent({ 
  stackGraph, 
  commitGraph, 
  selectedCommitId, 
  onCommitSelect 
}: { 
  stackGraph: LayoutStackGraph;
  commitGraph: Record<CommitId, { commit: Commit; children: CommitId[] }>;
  selectedCommitId?: CommitId;
  onCommitSelect: (commitId: CommitId) => void;
}) {
  const { stacks, connections, rootStacks, leafStacks, parallelGroups } = stackGraph;
  const containerRef = useRef<HTMLDivElement>(null);
  const [stackPositions, setStackPositions] = useState<Record<StackId, { x: number; y: number; top: number; bottom: number }>>({});
  
  const handleCommitSelect = (commitId: CommitId) => {
    onCommitSelect(commitId);
  };
  
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

  // Track positions of stack elements for drawing arrows
  useEffect(() => {
    if (!containerRef.current) return;
    
    const updatePositions = () => {
      const positions: Record<StackId, { x: number; y: number; top: number; bottom: number }> = {};
      const stackElements = containerRef.current?.querySelectorAll('[data-stack-id]');
      const scrollContainer = containerRef.current?.querySelector('[data-scroll-container]') as HTMLElement;
      
      stackElements?.forEach((element) => {
        const stackId = element.getAttribute('data-stack-id') as StackId;
        if (stackId && scrollContainer) {
          const rect = element.getBoundingClientRect();
          const scrollRect = scrollContainer.getBoundingClientRect();
          
          // Calculate position within the scroll container, accounting for scroll offset
          positions[stackId] = {
            x: rect.left - scrollRect.left + rect.width / 2,
            y: rect.top - scrollRect.top + scrollContainer.scrollTop + rect.height / 2,
            top: rect.top - scrollRect.top + scrollContainer.scrollTop,
            bottom: rect.top - scrollRect.top + scrollContainer.scrollTop + rect.height
          };
        }
      });
      
      setStackPositions(positions);
    };

    // Update positions after render
    const timeoutId = setTimeout(updatePositions, 100);
    
    // Update on resize and scroll
    const scrollContainer = containerRef.current?.querySelector('[data-scroll-container]');
    window.addEventListener('resize', updatePositions);
    scrollContainer?.addEventListener('scroll', updatePositions);
    
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updatePositions);
      scrollContainer?.removeEventListener('scroll', updatePositions);
    };
  }, [layoutLevels]);

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
    <div 
      ref={containerRef}
      style={{ 
        padding: '20px',
        border: '1px solid #e5e7eb', 
        borderRadius: '8px',
        background: '#fafafa'
      }}
    >
      {/* Header with summary */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '20px', color: '#111827' }}>
          📚 Commit Stack Graph
        </h2>
      </div>

      {/* Stack layout - vertical flow, newest on top */}
      <div 
        data-scroll-container
        style={{ 
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          overflowY: 'auto',
          maxHeight: '80vh',
          position: 'relative'
        }}
      >
        {/* SVG overlay for curved arrows - now inside the scrollable container */}
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 10
          }}
        >
          {connections.map((connection, index) => {
            const fromStack = stackPositions[connection.from];
            const toStack = stackPositions[connection.to];
            
            if (!fromStack || !toStack) return null;
            
            // Connection semantics: "from" is older stack, "to" is newer stack
            // Arrows should flow upward from older (lower in UI) to newer (higher in UI)
            // Use actual stack bounds instead of fixed offsets
            const fromPoint = { x: fromStack.x, y: fromStack.top }; // top edge of older stack
            const toPoint = { x: toStack.x, y: toStack.bottom }; // bottom edge of newer stack
            
            return (
              <CurvedArrow
                key={index}
                from={fromPoint}
                to={toPoint}
                type={connection.type}
              />
            );
          })}
        </svg>
        {layoutLevels.slice().reverse().map((level, levelIndex) => {
          const actualLevelIndex = layoutLevels.length - 1 - levelIndex;
          return (
          <div key={actualLevelIndex} style={{ position: 'relative', zIndex: 2 }}>
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
                  <div 
                    key={item.stackId} 
                    data-stack-id={item.stackId}
                    style={{ position: 'relative', minWidth: '280px' }}
                  >
                    <StackComponent 
                      stack={stack} 
                      commitGraph={commitGraph}
                      isInParallelGroup={item.isParallel}
                      selectedCommitId={selectedCommitId}
                      onCommitSelect={handleCommitSelect}
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