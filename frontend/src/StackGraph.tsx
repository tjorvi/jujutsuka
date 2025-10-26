import { useMemo, useRef, useEffect, useState, useId } from 'react';
import type { ChangeId, CommitId, Commit } from "../../backend/src/repo-parser";
import type { Stack, StackId, ParallelGroup, LayoutStackGraph } from "./stackUtils";
import { draggedFileChange, draggedChange, useDragDrop, type DropZonePosition } from './useDragDrop';
import { queries } from './api';
import { useGraphStore } from './graphStore';
import styles from './StackGraph.module.css';
import type { CommandTarget } from './commands';
import { ChangeCard } from './ChangeCard';

interface StackComponentProps {
  stack: Stack;
  commitGraph: Record<CommitId, { commit: Commit; children: CommitId[] }>;
  isInParallelGroup?: boolean;
  selectedCommitId?: CommitId;
  currentCommitId?: CommitId;
  divergentChangeIds: ReadonlySet<ChangeId>;
  onCommitSelect: (commitId: CommitId) => void;
}

interface DropZoneProps {
  position: DropZonePosition,
  children?: React.ReactNode;
}

function commandTargetFromPosition(position: DropZonePosition): CommandTarget | null {
  switch (position.kind) {
    case 'before':
      return { type: 'before', commitId: position.commit };
    case 'after':
      return { type: 'after', commitId: position.commit };
    case 'between':
      return {
        type: 'between',
        beforeCommitId: position.beforeCommit,
        afterCommitId: position.afterCommit,
      };
    case 'new-branch':
      return { type: 'new-branch', fromCommitId: position.commit };
    default:
      return null;
  }
}

function DropZone({ position, children }: DropZoneProps) {
  const { handleFileDrop, handleCommitDrop } = useDragDrop();
  const [isOver, setIsOver] = useState(false);
  const createNewChange = useGraphStore(state => state.createNewChange);
  const isExecutingCommand = useGraphStore(state => state.isExecutingCommand);
  const commandTarget = commandTargetFromPosition(position);
  const dropLabel = position.kind === 'between'
    ? 'between these changes'
    : `${position.kind} this change`;
  const dropTitle = `Drop to move ${dropLabel}`;

  const dropMetadata: Record<string, string> = {
    'data-drop-kind': position.kind,
  };

  if (position.kind === 'between') {
    dropMetadata['data-before-commit'] = position.beforeCommit;
    dropMetadata['data-after-commit'] = position.afterCommit;
  } else if (position.kind === 'before' || position.kind === 'after' || position.kind === 'existing') {
    dropMetadata['data-commit'] = position.commit;
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);

    const fc = draggedFileChange(e);
    const cc = draggedChange(e);

    if (fc) {
      handleFileDrop(position, fc);
    } else if (cc) {
      handleCommitDrop(position, cc);
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

  const handleCreateEmptyChange = () => {
    if (!commandTarget) {
      return;
    }
    void createNewChange([], commandTarget);
  };

  const dropZoneLine = (
    <div className={styles.dropZoneWrapper}>
      <div
        className={styles.dropZoneLinear}
        {...dropMetadata}
        data-over={isOver ? 'true' : 'false'}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        title={dropTitle}
      />
      {commandTarget && (
        <button
          type="button"
          className={styles.dropZoneAction}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            handleCreateEmptyChange();
          }}
          disabled={isExecutingCommand}
        >
          New change
        </button>
      )}
    </div>
  );

  return (
    <>
      {position.kind === 'before' && (
        dropZoneLine
      )}
      {children}
      {(position.kind === 'after' || position.kind === 'between') && (
        dropZoneLine
      )}
    </>
  );
}

function StackComponent({
  stack,
  commitGraph,
  isInParallelGroup = false,
  selectedCommitId,
  currentCommitId,
  divergentChangeIds,
  onCommitSelect
}: StackComponentProps) {
  const [hoveredCommitId, setHoveredCommitId] = useState<CommitId | null>(null);
  const [commitStats, setCommitStats] = useState<Record<CommitId, { additions: number; deletions: number }>>({});
  const [draggedCommitId, setDraggedCommitId] = useState<CommitId | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const repoPath = useGraphStore(state => state.repoPath);
  const bookmarksByCommit = useGraphStore(state => state.bookmarksByCommit);
  const commitsInDisplayOrder = useMemo(() => stack.commits.slice().reverse(), [stack.commits]);

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

  return (<>
    <svg width="12" height="12" style={{
      display: 'block',
      margin: '0 auto',
    }}>
      <circle r="2" cx="6" cy="6" fill="black" />
    </svg>
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
      {commitsInDisplayOrder[0] && (
        <DropZone
          position={{ kind: 'after', commit: commitsInDisplayOrder[0] }}
        />
      )}

      {commitsInDisplayOrder.map((commitId, index) => {
        const commit = commitGraph[commitId]?.commit;
        if (!commit) return null;

        const isSelected = selectedCommitId === commitId;
        const isCurrent = currentCommitId === commitId;
        const isDivergent = divergentChangeIds.has(commit.changeId);
        const nextCommitId = commitsInDisplayOrder[index + 1];
        const stats = commitStats[commitId];
        const isEmpty = (!stats || (stats.additions === 0 && stats.deletions === 0)) &&
                        (commit.description === '' || commit.description === '(no description)');
        const commitBookmarks = bookmarksByCommit[commitId] ?? [];

        // Debug logging
        console.log('Commit', commitId.slice(0, 8), {
          description: commit.description,
          stats,
          isEmpty,
          hasStats: !!stats,
          additions: stats?.additions,
          deletions: stats?.deletions,
          bookmarks: commitBookmarks,
        });

        return (
          <div key={commitId} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <ChangeCard
              commitId={commitId}
              commit={commit}
              stats={stats}
              draggedCommitId={draggedCommitId}
              hoveredCommitId={hoveredCommitId}
              isDraggingFile={isDraggingFile}
              isInParallelGroup={isInParallelGroup}
              isSelected={isSelected}
              isCurrent={isCurrent}
              isDivergent={isDivergent}
              isEmpty={isEmpty}
              bookmarks={commitBookmarks}
              onCommitSelect={onCommitSelect}
              setHoveredCommitId={(value) => setHoveredCommitId(value)}
              setIsDraggingFile={(value) => setIsDraggingFile(value)}
              setDraggedCommitId={(value) => setDraggedCommitId(value)}
            />
            <DropZone
              position={nextCommitId
                ? { kind: 'between', beforeCommit: commitId, afterCommit: nextCommitId }
                : { kind: 'before', commit: commitId }
              }
            />
          </div>
        );
      })}
    </div>

    <svg width="12" height="12" style={{
      display: 'block',
      margin: '0 auto',
    }}>
      <path d="M0,12 L6,0 L12,12" fill="black" />
    </svg>
    </>
  );
}

interface SplitArrowProps {
  count: number; // Number of stacks being split into
  stackWidth: number;
  gap: number;
}

function SplitArrow({ count, stackWidth, gap }: SplitArrowProps) {
  const branchCount = Math.max(count, 1);
  const totalWidth = branchCount * stackWidth + (branchCount - 1) * gap;
  const height = 56;
  const topPadding = 8;
  const bottomPadding = 8;
  const stemLength = 18;
  const arrowHeadLength = 12;
  const strokeWidth = 3;
  const color = '#f59e0b';

  const centerX = totalWidth / 2;
  const bottomY = height - bottomPadding;
  const stemTopY = bottomY - stemLength;
  const arrowBaseY = topPadding + arrowHeadLength;
  const curveStrength = Math.max((stemTopY - arrowBaseY) * 0.45, 0);

  const rawMarkerId = useId();
  const markerId = `split-arrow-${rawMarkerId.replace(/:/g, '')}`;

  const branchCenters = useMemo(
    () => Array.from({ length: branchCount }, (_, index) => (stackWidth / 2) + index * (stackWidth + gap)),
    [branchCount, stackWidth, gap],
  );

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        width: '100%',
      }}
    >
      <svg
        width={totalWidth}
        height={height}
        style={{ overflow: 'visible' }}
        aria-hidden="true"
      >
        <defs>
          <marker
            id={markerId}
            markerWidth="6"
            markerHeight="6"
            refX="3"
            refY="3"
            orient="0"
            markerUnits="strokeWidth"
          >
            <path d="M0,6 L3,0 L6,6" fill={color} />
          </marker>
        </defs>

        <line
          x1={centerX}
          y1={bottomY}
          x2={centerX}
          y2={stemTopY}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {branchCenters.map((targetX) => (
          <path
            key={targetX}
            d={[
              `M ${centerX} ${stemTopY}`,
              `C ${centerX} ${stemTopY - curveStrength} ${targetX} ${arrowBaseY + curveStrength} ${targetX} ${arrowBaseY}`,
              `L ${targetX} ${topPadding}`,
            ].join(' ')}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd={`url(#${markerId})`}
          />
        ))}
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
  const branchCount = Math.max(count, 1);
  const totalWidth = branchCount * stackWidth + (branchCount - 1) * gap;
  const height = 56;
  const topPadding = 8;
  const bottomPadding = 8;
  const startVertical = 18;
  const arrowHeadLength = 12;
  const strokeWidth = 3;
  const color = '#10b981';

  const centerX = totalWidth / 2;
  const bottomY = height - bottomPadding;
  const startY = bottomY - startVertical;
  const arrowBaseY = topPadding + arrowHeadLength;
  const curveStrength = Math.max((startY - arrowBaseY) * 0.45, 0);

  const rawMarkerId = useId();
  const markerId = `merge-arrow-${rawMarkerId.replace(/:/g, '')}`;

  const branchStarts = useMemo(
    () => Array.from({ length: branchCount }, (_, index) => (stackWidth / 2) + index * (stackWidth + gap)),
    [branchCount, stackWidth, gap],
  );

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        width: '100%',
      }}
    >
      <svg
        width={totalWidth}
        height={height}
        style={{ overflow: 'visible' }}
        aria-hidden="true"
      >
        <defs>
          <marker
            id={markerId}
            markerWidth="6"
            markerHeight="6"
            refX="3"
            refY="3"
            orient="0"
            markerUnits="strokeWidth"
          >
            <path d="M0,6 L3,0 L6,6" fill={color} />
          </marker>
        </defs>

        {branchStarts.map((startX) => (
          <path
            key={startX}
            d={[
              `M ${startX} ${bottomY}`,
              `L ${startX} ${startY}`,
              `C ${startX} ${startY - curveStrength} ${centerX} ${arrowBaseY + curveStrength} ${centerX} ${arrowBaseY}`,
            ].join(' ')}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        <path
          d={`M ${centerX} ${arrowBaseY} L ${centerX} ${topPadding}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          markerEnd={`url(#${markerId})`}
        />
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
  currentCommitId,
  divergentChangeIds,
  onCommitSelect
}: {
  stackGraph: LayoutStackGraph;
  commitGraph: Record<CommitId, { commit: Commit; children: CommitId[] }>;
  selectedCommitId?: CommitId;
  currentCommitId?: CommitId;
  divergentChangeIds: ReadonlySet<ChangeId>;
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
                        currentCommitId={currentCommitId}
                        divergentChangeIds={divergentChangeIds}
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
