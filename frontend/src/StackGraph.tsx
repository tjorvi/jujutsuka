import { useMemo, useRef, useEffect, useState } from 'react';
import type { CommitId, Commit } from "../../backend/src/repo-parser";
import type { Stack, StackId } from "./stackUtils";
import type { ParallelGroup, LayoutStackGraph } from "./stackUtils";
import { draggedFileChange, draggedChange, dragChange, useDragDrop, type DropZonePosition } from './useDragDrop';
import { queries } from './api';
import { useGraphStore } from './graphStore';
import styles from './StackGraph.module.css';

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

interface DropZoneProps {
  position: DropZonePosition,
  children?: React.ReactNode;
}

function DropZone({ position, children }: DropZoneProps) {
  const { handleFileDrop, handleCommitDrop } = useDragDrop();
  const [isOver, setIsOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);

    const fc = draggedFileChange(e);
    const cc = draggedChange(e);

    if (fc) {
      handleFileDrop(position, fc);
    } else if (cc) {
      if (position.kind === 'new-branch') {
        handleCommitDrop(position.commit, 'rebase-after', cc);
      } else if (position.kind === 'before') {
        handleCommitDrop(position.commit, 'rebase-before', cc);
      } else if (position.kind === 'after') {
        handleCommitDrop(position.commit, 'rebase-after', cc);
      }
      // Note: 'between' and 'existing' are not valid for commit drops
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

  if (position.kind === 'new-branch') {
    return (
      <div style={{ position: 'relative' }}>
        {children}
        <div
          className={styles.dropZoneBranch}
          data-over={isOver ? 'true' : 'false'}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          title="Drop to create new branch"
        >
          🌿
        </div>
      </div>
    );
  }

  return (
    <>
      {position.kind === 'before' && (
        <div
          className={styles.dropZoneLinear}
          data-over={isOver ? 'true' : 'false'}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          title={`Drop to move ${position.kind} this change`}
        />
      )}
      {children}
      {(position.kind === 'after' || position.kind === 'between') && (
        <div
          className={styles.dropZoneLinear}
          data-over={isOver ? 'true' : 'false'}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          title={`Drop to move ${position.kind} this change`}
        />
      )}
    </>
  );
}

function StackComponent({ stack, commitGraph, isInParallelGroup = false, selectedCommitId, onCommitSelect }: StackComponentProps) {
  const { handleFileDrop, handleCommitDrop } = useDragDrop();
  const [hoveredCommitId, setHoveredCommitId] = useState<CommitId | null>(null);
  const [commitStats, setCommitStats] = useState<Record<CommitId, { additions: number; deletions: number }>>({});
  const [draggedCommitId, setDraggedCommitId] = useState<CommitId | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
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
    <div
      className={styles.stackContainer}
      data-parallel={isInParallelGroup ? 'true' : 'false'}
      data-file-dragging={(isDraggingFile && !draggedCommitId) ? 'true' : 'false'}
    >
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
        position={{ kind: 'before', commit: stack.commits[0] }}
      />

      {stack.commits.slice().reverse().map((commitId, index) => {
        const commit = commitGraph[commitId]?.commit;
        if (!commit) return null;

        const isSelected = selectedCommitId === commitId;
        const isDragTarget = isDraggingFile && !draggedCommitId; // Only true when dragging file, not commit
        const isHovered = hoveredCommitId === commitId;
        const isBeingDragged = draggedCommitId === commitId;
        const isCommitDropTarget = draggedCommitId && draggedCommitId !== commitId;
        const hasConflicts = commit.hasConflicts;

        // For the "after" drop zone, we need to determine the next commit
        const reversedCommits = stack.commits.slice().reverse();
        const nextCommitId = reversedCommits[index + 1];

        return (
          <DropZone
            key={commitId}
            position={nextCommitId
              ? { kind: 'between', beforeCommit: commitId, afterCommit: nextCommitId }
              : { kind: 'after', commit: commitId }
            }
          >
            <DropZone
              position={{ kind: 'new-branch', commit: commitId }}
            >
              <div
                draggable={true}
                className={styles.commitCard}
                data-selected={isSelected ? 'true' : 'false'}
                data-being-dragged={isBeingDragged ? 'true' : 'false'}
                data-hovered={(isHovered && !isSelected) ? 'true' : 'false'}
                data-commit-dragging={(draggedCommitId !== null && draggedCommitId !== commitId) ? 'true' : 'false'}
                data-file-dragging={(isDraggingFile && !draggedCommitId) ? 'true' : 'false'}
                data-commit-drop-target={(isCommitDropTarget && !isHovered) ? 'true' : 'false'}
                data-file-drag-target={(isDragTarget && !isHovered) ? 'true' : 'false'}
                data-parallel={isInParallelGroup ? 'true' : 'false'}
                data-conflict={hasConflicts ? 'true' : 'false'}
                style={{
                  marginBottom: index < stack.commits.length - 1 ? '4px' : '0',
                }}
                onDragStart={(e: React.DragEvent) => {
                  e.stopPropagation();
                  setDraggedCommitId(commitId);
                  const changeId = commit.changeId;
                  dragChange(e, { source: 'change', changeId, commitId });
                }}
                onDragEnd={() => {
                  setDraggedCommitId(null);
                  setHoveredCommitId(null);
                }}
                onClick={() => onCommitSelect(commitId)}
                onDrop={!isSelected ? (e: React.DragEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setHoveredCommitId(null);
                  setIsDraggingFile(false);

                  const fc = draggedFileChange(e);
                  const cc = draggedChange(e);

                  if (fc) {
                    // Handle file drop - move to existing commit
                    console.log('Dropped file:', fc.fileChange, 'from commit:', fc.fromCommitId, 'to commit:', commitId);
                    handleFileDrop({ kind: 'existing', commit: commitId }, fc);
                  } else if (cc) {
                    // Handle commit drop (squash)
                    handleCommitDrop(commitId, 'squash', cc);
                  }
                } : undefined}
                onDragOver={!isSelected ? (e: React.DragEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = 'move';
                } : undefined}
                onDragEnter={!isSelected ? (e: React.DragEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setHoveredCommitId(commitId);
                  // We can't access getData during drag events, so check if application/json type exists
                  if (e.dataTransfer.types.includes('application/json')) {
                    setIsDraggingFile(true);
                  }
                } : undefined}
                onDragLeave={!isSelected ? (e: React.DragEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // Only clear hover if we're leaving the commit itself, not moving to a child
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setHoveredCommitId(null);
                  }
                } : undefined}
              >
                <div style={{ fontSize: '10px', fontFamily: 'monospace', color: '#6b7280', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ fontWeight: '600', color: '#374151' }}>
                        change: {commit.changeId.slice(0, 8)}
                      </div>
                      {hasConflicts && (
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: 600,
                            color: '#b91c1c',
                            border: '1px solid #fca5a5',
                            borderRadius: '3px',
                            padding: '1px 4px',
                            background: '#fef2f2',
                            textTransform: 'uppercase',
                          }}
                        >
                          conflict
                        </span>
                      )}
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
