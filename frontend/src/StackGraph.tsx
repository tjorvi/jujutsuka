import { useMemo, useRef, useEffect, useState } from 'react';
import type { CommitId, Commit } from "../../backend/src/repo-parser";
import type { Stack, StackId } from "./stackUtils";
import type { ParallelGroup, LayoutStackGraph } from "./stackUtils";
import { useDragDrop } from './useDragDrop';
import { queries } from './api';
import { useGraphStore } from './graphStore';

interface StackComponentProps {
  stack: Stack;
  commitGraph: Record<CommitId, { commit: Commit; children: CommitId[] }>;
  isInParallelGroup?: boolean;
  selectedCommitId?: CommitId;
  onCommitSelect: (commitId: CommitId) => void;
}

// Helper function to create a visual size indicator for commits
function getCommitSizeIndicator(additions: number, deletions: number) {
  const total = additions + deletions;

  // Categorize size
  let size: 'tiny' | 'small' | 'medium' | 'large' | 'huge';
  let label: string;

  if (total === 0) {
    size = 'tiny';
    label = '';
  } else if (total <= 10) {
    size = 'tiny';
    label = 'XS';
  } else if (total <= 50) {
    size = 'small';
    label = 'S';
  } else if (total <= 200) {
    size = 'medium';
    label = 'M';
  } else if (total <= 500) {
    size = 'large';
    label = 'L';
  } else {
    size = 'huge';
    label = 'XL';
  }

  const colors = {
    tiny: '#d1d5db',
    small: '#93c5fd',
    medium: '#fbbf24',
    large: '#fb923c',
    huge: '#ef4444',
  };

  return {
    size,
    label,
    color: colors[size],
    tooltip: `+${additions} -${deletions}`,
  };
}

type DropZonePosition = {
  kind: 'between',
  beforeCommit: CommitId;
  afterCommit: CommitId;
} 
| { kind: 'after', commit: CommitId }
| { kind: 'before', commit: CommitId }
| { kind: 'new-branch', commit: CommitId }
| { kind: 'existing', commit: CommitId };

interface DropZoneProps {
  position: DropZonePosition,
  children?: React.ReactNode;
}

function DropZone({ position, children }: DropZoneProps) {
  const { draggedFile, draggedFromCommit, draggedCommit, handleFileDrop, handleCommitDrop } = useDragDrop();
  const [isOver, setIsOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);

    if (draggedFile && draggedFromCommit) {
      handleFileDrop(position);
    } else if (draggedCommit) {
      if (position.kind === 'new-branch') {
        handleCommitDrop(position.commit, 'rebase-after');
      } else {
        const action = position === 'before' ? 'rebase-before' : 'rebase-after';
        handleCommitDrop(targetCommitId, action);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only set isOver to false if we're leaving the dropzone itself,
    // not just moving to a child element
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsOver(false);
    }
  };

  const getDropZoneStyle = () => {
    const baseStyle = {
      transition: 'all 0.2s ease',
    };

    if (position === 'branch') {
      return {
        ...baseStyle,
        position: 'absolute' as const,
        right: '-20px',
        top: '50%',
        transform: 'translateY(-50%)',
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        background: isOver ? '#10b981' : '#e5e7eb',
        border: '2px dashed #6b7280',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: (draggedFile || draggedCommit) ? (isOver ? 1 : 0.7) : 0,
        fontSize: '20px',
        pointerEvents: (draggedFile || draggedCommit) ? 'auto' as const : 'none' as const,
      };
    }

    return {
      ...baseStyle,
      width: '100%',
      height: '8px', // Fixed height always
      background: isOver ? '#10b981' : '#e5e7eb',
      borderRadius: '2px',
      border: isOver ? '2px dashed #059669' : '1px dashed #9ca3af',
      margin: '4px 0',
      opacity: (draggedFile || draggedCommit) ? (isOver ? 1 : 0.3) : 0,
      pointerEvents: (draggedFile || draggedCommit) ? 'auto' as const : 'none' as const,
    };
  };

  if (position === 'branch') {
    return (
      <div style={{ position: 'relative' }}>
        {children}
        <div
          onDrop={(draggedFile || draggedCommit) ? handleDrop : undefined}
          onDragOver={(draggedFile || draggedCommit) ? handleDragOver : undefined}
          onDragEnter={(draggedFile || draggedCommit) ? handleDragEnter : undefined}
          onDragLeave={(draggedFile || draggedCommit) ? handleDragLeave : undefined}
          style={getDropZoneStyle()}
          title="Drop to create new branch"
        >
          🌿
        </div>
      </div>
    );
  }

  return (
    <>
      {position === 'before' && (
        <div
          onDrop={(draggedFile || draggedCommit) ? handleDrop : undefined}
          onDragOver={(draggedFile || draggedCommit) ? handleDragOver : undefined}
          onDragEnter={(draggedFile || draggedCommit) ? handleDragEnter : undefined}
          onDragLeave={(draggedFile || draggedCommit) ? handleDragLeave : undefined}
          style={getDropZoneStyle()}
          title={`Drop to move ${position} this change`}
        />
      )}
      {children}
      {position === 'after' && (
        <div
          onDrop={(draggedFile || draggedCommit) ? handleDrop : undefined}
          onDragOver={(draggedFile || draggedCommit) ? handleDragOver : undefined}
          onDragEnter={(draggedFile || draggedCommit) ? handleDragEnter : undefined}
          onDragLeave={(draggedFile || draggedCommit) ? handleDragLeave : undefined}
          style={getDropZoneStyle()}
          title={`Drop to move ${position} this change`}
        />
      )}
    </>
  );
}

function StackComponent({ stack, commitGraph, isInParallelGroup = false, selectedCommitId, onCommitSelect }: StackComponentProps) {
  const { draggedFile, draggedFromCommit, draggedCommit, setDraggedCommit, handleFileDrop, handleCommitDrop } = useDragDrop();
  const [hoveredCommitId, setHoveredCommitId] = useState<CommitId | null>(null);
  const [commitStats, setCommitStats] = useState<Record<CommitId, { additions: number; deletions: number }>>({});
  const repoPath = useGraphStore(state => state.repoPath);

  // Fetch stats for all commits in the stack
  useEffect(() => {
    if (!repoPath) return;

    const fetchStats = async () => {
      const stats: Record<CommitId, { additions: number; deletions: number }> = {};
      for (const commitId of stack.commits) {
        const result = await queries.commitStats.query({ repoPath, commitId });
        stats[commitId] = result;
      }
      setCommitStats(stats);
    };

    fetchStats();
  }, [stack.commits, repoPath]);

  // Debug: log first commit data to see what we're getting
  useEffect(() => {
    if (stack.commits.length > 0) {
      const firstCommitId = stack.commits[0];
      const commitData = commitGraph[firstCommitId];
      if (commitData) {
        console.log('🐛 DEBUG commit data:', {
          id: firstCommitId,
          changeId: commitData.commit.changeId,
          description: commitData.commit.description,
          author: commitData.commit.author.name,
          timestamp: commitData.commit.timestamp
        });
      }
    }
  }, [stack.commits, commitGraph]);

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
      opacity: draggedFile && draggedFromCommit !== selectedCommitId ? 0.8 : 1,
    }}>
      <div style={{
        fontSize: '12px',
        fontWeight: 'bold',
        marginBottom: '8px',
        color: isInParallelGroup ? '#7c3aed' : '#6b7280'
      }}>
        {stack.commits.length} commit{stack.commits.length > 1 ? 's' : ''}
      </div>

      {/* Top drop zone for new commits at the top of the stack */}
      <DropZone
        targetCommitId={stack.commits[0]}
        position="before"
        afterCommitId={stack.commits[0]}
      />

      {stack.commits.slice().reverse().map((commitId, index) => {
        const commit = commitGraph[commitId]?.commit;
        if (!commit) return null;

        const isSelected = selectedCommitId === commitId;
        const isDragTarget = draggedFile && draggedFromCommit !== commitId;
        const isHovered = hoveredCommitId === commitId;
        const isBeingDragged = draggedCommit === commitId;
        const isCommitDropTarget = draggedCommit && draggedCommit !== commitId;

        // For the "after" drop zone, we need to determine the next commit
        const reversedCommits = stack.commits.slice().reverse();
        const nextCommitId = reversedCommits[index + 1];

        return (
          <DropZone
            key={commitId}
            targetCommitId={commitId}
            position="after"
            beforeCommitId={commitId}
            afterCommitId={nextCommitId}
          >
            <DropZone
              targetCommitId={commitId}
              position="branch"
            >
              <div
                draggable={true}
                onDragStart={(e: React.DragEvent) => {
                  e.stopPropagation();
                  setDraggedCommit(commitId);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', commitId);
                }}
                onDragEnd={() => {
                  setDraggedCommit(null);
                  setHoveredCommitId(null);
                }}
                onClick={() => onCommitSelect(commitId)}
                onDrop={!isSelected ? (e: React.DragEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setHoveredCommitId(null);

                  if (draggedFile && draggedFromCommit) {
                    // Handle file drop - move to existing commit
                    console.log('Dropped file:', draggedFile, 'from commit:', draggedFromCommit, 'to commit:', commitId);
                    handleFileDrop(commitId, 'existing');
                  } else if (draggedCommit) {
                    // Handle commit drop (squash)
                    handleCommitDrop(commitId, 'squash');
                  }
                } : undefined}
                onDragOver={!isSelected && (draggedFile || draggedCommit) ? (e: React.DragEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = 'move';
                } : undefined}
                onDragEnter={!isSelected && (draggedFile || draggedCommit) ? (e: React.DragEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setHoveredCommitId(commitId);
                } : undefined}
                onDragLeave={!isSelected && (draggedFile || draggedCommit) ? (e: React.DragEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // Only clear hover if we're leaving the commit itself, not moving to a child
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setHoveredCommitId(null);
                  }
                } : undefined}
                style={{
                  padding: '8px',
                  marginBottom: index < stack.commits.length - 1 ? '4px' : '0',
                  background: isSelected
                    ? '#e0f2fe'
                    : isHovered
                      ? (draggedCommit ? '#fef3c7' : '#dcfce7')
                      : isBeingDragged
                        ? '#f3f4f6'
                        : '#f8fafc',
                  borderRadius: '4px',
                  borderLeft: isSelected
                    ? '3px solid #0284c7'
                    : isInParallelGroup
                      ? '3px solid #a855f7'
                      : '3px solid #3b82f6',
                  cursor: isBeingDragged ? 'grabbing' : 'grab',
                  transition: 'all 0.2s ease',
                  border: isSelected
                    ? '1px solid #0284c7'
                    : isHovered
                      ? (draggedCommit ? '2px solid #f59e0b' : '2px solid #16a34a')
                      : isCommitDropTarget
                        ? '1px dashed #f59e0b'
                        : isDragTarget
                          ? '1px solid #10b981'
                          : '1px solid transparent',
                  boxShadow: isSelected
                    ? 'none'
                    : isHovered
                      ? (draggedCommit ? '0 0 12px rgba(245, 158, 11, 0.4)' : '0 0 12px rgba(34, 197, 94, 0.4)')
                      : isBeingDragged
                        ? '0 4px 12px rgba(0, 0, 0, 0.15)'
                        : isCommitDropTarget
                          ? '0 0 8px rgba(245, 158, 11, 0.3)'
                          : isDragTarget
                            ? '0 0 8px rgba(16, 185, 129, 0.3)'
                            : 'none',
                  transform: isHovered
                    ? 'scale(1.02)'
                    : isBeingDragged
                      ? 'scale(0.98) rotate(2deg)'
                      : 'scale(1)',
                  opacity: isBeingDragged ? 0.7 : 1,
                }}
              >
                <div style={{ fontSize: '10px', fontFamily: 'monospace', color: '#6b7280', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: '600', color: '#374151' }}>
                      change: {commit.changeId.slice(0, 8)}
                    </div>
                    {commitStats[commitId] && (() => {
                      const { additions, deletions } = commitStats[commitId];
                      const indicator = getCommitSizeIndicator(additions, deletions);
                      return indicator.label ? (
                        <div
                          style={{
                            fontSize: '9px',
                            fontWeight: 'bold',
                            padding: '1px 5px',
                            borderRadius: '3px',
                            background: indicator.color,
                            color: 'white',
                          }}
                          title={indicator.tooltip}
                        >
                          {indicator.label}
                        </div>
                      ) : null;
                    })()}
                  </div>
                  <div style={{ fontSize: '9px', color: '#9ca3af' }}>
                    commit: {commitId.slice(0, 8)}
                  </div>
                </div>
                <div style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  margin: '4px 0',
                  color: '#111827',
                  wordWrap: 'break-word',
                  lineHeight: '1.2'
                }}>
                  {commit.description}
                </div>
                <div style={{ fontSize: '11px', color: '#6b7280' }}>
                  {commit.author.name} • {commit.timestamp.toLocaleDateString()}
                </div>
              </div>
            </DropZone>
          </DropZone>
        );
      })}
    </div>
  );
}

interface SplitArrowProps {
  count: number; // Number of stacks being split into
  stackWidth: number;
  gap: number;
}

function SplitArrow({ count, stackWidth, gap }: SplitArrowProps) {
  const totalWidth = count * stackWidth + (count - 1) * gap;
  const height = 40;

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      padding: '8px 0',
      width: '100%',
    }}>
      <svg width={totalWidth} height={height} style={{ overflow: 'visible' }}>
        {/* Split arrows go here - you'll implement the actual lines */}
        <text x={totalWidth / 2} y={height / 2} textAnchor="middle" fill="#f59e0b" fontSize="14">
          Split ({count})
        </text>
      </svg>
    </div>
  );
}

interface MergeArrowProps {
  count: number; // Number of stacks being merged from
  stackWidth: number;
  gap: number;
}

function MergeArrow({ count, stackWidth, gap }: MergeArrowProps) {
  const totalWidth = count * stackWidth + (count - 1) * gap;
  const height = 40;

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      padding: '8px 0',
      width: '100%',
    }}>
      <svg width={totalWidth} height={height} style={{ overflow: 'visible' }}>
        {/* Merge arrows go here - you'll implement the actual lines */}
        <text x={totalWidth / 2} y={height / 2} textAnchor="middle" fill="#10b981" fontSize="14">
          Merge ({count})
        </text>
      </svg>
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
  // Log when commit graph changes to track optimistic updates
  useEffect(() => {
    console.log('📊 StackGraphComponent received new commitGraph with keys:', Object.keys(commitGraph));
  }, [commitGraph]);

  const { stacks, connections, rootStacks, leafStacks, parallelGroups } = stackGraph;
  const containerRef = useRef<HTMLDivElement>(null);

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

    console.log('🔧 Layout levels:', levels.map((level, i) => ({
      level: i,
      stacks: level.map(item => ({
        stackId: item.stackId,
        isParallel: item.isParallel,
        parallelGroupId: item.parallelGroupId
      }))
    })));

    console.log('🔧 Parallel groups:', parallelGroups);

    return levels;
  }, [stacks, rootStacks, stackToGroup, parallelGroups]);

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
          gap: '0px', // Remove gap, we'll add connectors
          overflowY: 'auto',
          maxHeight: '80vh',
          position: 'relative'
        }}
      >
        {layoutLevels.slice().reverse().map((level, levelIndex) => {
          const actualLevelIndex = layoutLevels.length - 1 - levelIndex;
          const isLastLevel = levelIndex === layoutLevels.length - 1;

          return (
            <div key={actualLevelIndex}>
              {/* Stacks in this level - horizontal layout, centered */}
              <div style={{
                display: 'flex',
                gap: level.length > 1 ? '40px' : '16px',
                flexWrap: 'nowrap',
                alignItems: 'flex-start',
                justifyContent: level.length > 1 ? 'center' : 'center',
                position: 'relative',
                overflowX: 'auto',
                minWidth: '100%',
                padding: '20px 0',
              }}>
                {level.map((item) => {
                  const stack = stacks[item.stackId];

                  return (
                    <div
                      key={item.stackId}
                      data-stack-id={item.stackId}
                      style={{
                        position: 'relative',
                        minWidth: '220px',
                        flexShrink: 0
                      }}
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

              {/* Arrow connector to next level - shows relationship */}
              {!isLastLevel && (() => {
                const nextLevel = layoutLevels[layoutLevels.length - levelIndex - 2];
                const currentCount = level.length;
                const nextCount = nextLevel.length;
                const isSplit = currentCount > 1 && nextCount === 1;
                const isMerge = currentCount === 1 && nextCount > 1;

                const stackWidth = 220;
                const gap = 40;

                if (isMerge) {
                  return <MergeArrow count={nextCount} stackWidth={stackWidth} gap={gap} />;
                }

                if (isSplit) {
                  return <SplitArrow count={currentCount} stackWidth={stackWidth} gap={gap} />;
                }

                // Linear - simple arrow
                return (
                  <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: '8px 0',
                  }}>
                    <div style={{
                      fontSize: '24px',
                      color: '#3b82f6',
                    }}>
                      ↑
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })}
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
          Root stacks: {rootStacks.join(', ')}<br />
          Leaf stacks: {leafStacks.join(', ')}
        </div>
      </details>
    </div>
  );
}