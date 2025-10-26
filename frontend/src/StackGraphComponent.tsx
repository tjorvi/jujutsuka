import { useEffect, useMemo, useId } from 'react';
import type { ChangeId, CommitId, Commit, BookmarkName } from '../../backend/src/repo-parser';
import type { LayoutStackGraph, ParallelGroup, StackId } from './stackUtils';
import { draggedChange, draggedFileChange, draggedBookmark, getActiveDragMeta, clearActiveDragMeta } from './useDragDrop';
import { StackComponent } from './StackComponent';

type DragMeta =
  | { kind: 'change'; commitId: CommitId; changeId: ChangeId }
  | { kind: 'file-change'; fromCommitId: CommitId; fromChangeId: ChangeId }
  | { kind: 'bookmark'; bookmarkName: BookmarkName }
  | { kind: 'external-file' }
  | { kind: 'external-text' }
  | { kind: 'unknown' };

function extractDragMeta(dataTransfer: DataTransfer | null): DragMeta {
  const activeMeta = getActiveDragMeta();
  if (activeMeta) {
    if (activeMeta.kind === 'change') {
      return {
        kind: 'change',
        commitId: activeMeta.commitId,
        changeId: activeMeta.changeId,
      };
    }
    if (activeMeta.kind === 'file-change') {
      return {
        kind: 'file-change',
        fromCommitId: activeMeta.fromCommitId,
        fromChangeId: activeMeta.fromChangeId,
      };
    }
    return {
      kind: 'bookmark',
      bookmarkName: activeMeta.bookmarkName,
    };
  }

  if (!dataTransfer) {
    return { kind: 'unknown' };
  }

  const change = draggedChange({ dataTransfer });
  if (change) {
    return { kind: 'change', commitId: change.commitId, changeId: change.changeId };
  }

  const fileChange = draggedFileChange({ dataTransfer });
  if (fileChange) {
    return {
      kind: 'file-change',
      fromCommitId: fileChange.fromCommitId,
      fromChangeId: fileChange.fromChangeId,
    };
  }

  const bookmark = draggedBookmark({ dataTransfer });
  if (bookmark) {
    return { kind: 'bookmark', bookmarkName: bookmark.bookmarkName };
  }

  const dataTransferTypes = Array.from(dataTransfer.types);

  if (dataTransferTypes.includes('Files')) {
    return { kind: 'external-file' };
  }

  if (dataTransferTypes.includes('text/plain')) {
    return { kind: 'external-text' };
  }

  return { kind: 'unknown' };
}

function applyRootDragAttributes(element: HTMLDivElement, meta: DragMeta) {
  element.dataset.dragActive = 'true';
  element.dataset.dragKind = meta.kind;

  switch (meta.kind) {
    case 'change':
      element.dataset.dragCommitId = meta.commitId;
      element.dataset.dragChangeId = meta.changeId;
      delete element.dataset.dragFromCommitId;
      delete element.dataset.dragFromChangeId;
      delete element.dataset.dragBookmarkName;
      break;
    case 'file-change':
      element.dataset.dragFromCommitId = meta.fromCommitId;
      element.dataset.dragFromChangeId = meta.fromChangeId;
      delete element.dataset.dragCommitId;
      delete element.dataset.dragChangeId;
      delete element.dataset.dragBookmarkName;
      break;
    case 'bookmark':
      element.dataset.dragBookmarkName = meta.bookmarkName as string;
      delete element.dataset.dragCommitId;
      delete element.dataset.dragChangeId;
      delete element.dataset.dragFromCommitId;
      delete element.dataset.dragFromChangeId;
      break;
    default:
      delete element.dataset.dragCommitId;
      delete element.dataset.dragChangeId;
      delete element.dataset.dragFromCommitId;
      delete element.dataset.dragFromChangeId;
      delete element.dataset.dragBookmarkName;
      break;
  }
}

function clearRootDragAttributes(element: HTMLDivElement) {
  delete element.dataset.dragActive;
  delete element.dataset.dragKind;
  delete element.dataset.dragCommitId;
  delete element.dataset.dragChangeId;
  delete element.dataset.dragFromCommitId;
  delete element.dataset.dragFromChangeId;
  delete element.dataset.dragBookmarkName;
}

interface RootDragState {
  active: boolean;
  meta: DragMeta;
}

const inactiveRootDragState: RootDragState = { active: false, meta: { kind: 'unknown' } };

function logRootDragState(source: string, state: RootDragState, types: readonly string[]) {
  console.info('[StackGraph][drag-state]', {
    source,
    active: state.active,
    meta: state.meta,
    dataTransferTypes: types,
  });
}

function applyRootDragState(element: HTMLDivElement, state: RootDragState) {
  if (!state.active) {
    clearRootDragAttributes(element);
    return;
  }
  applyRootDragAttributes(element, state.meta);
}

function deriveRootDragState(dataTransfer: DataTransfer | null): { state: RootDragState; types: readonly string[] } {
  const types = dataTransfer ? Array.from(dataTransfer.types) : [];
  const meta = extractDragMeta(dataTransfer ?? null);
  if (meta.kind === 'unknown' && dataTransfer) {
    try {
      const rawPayload = dataTransfer.getData('application/json');
      if (rawPayload) {
        console.warn('[StackGraph][drag-state] unresolved drag meta despite payload', { types, rawPayload });
      }
    } catch (error) {
      console.warn('[StackGraph][drag-state] failed to inspect drag payload', { error, types });
    }
  }
  return { state: { active: true, meta }, types };
}

function scheduleAfterDragStart(callback: () => void) {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(callback);
    return;
  }
  void Promise.resolve().then(callback);
}

interface SplitArrowProps {
  count: number;
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
  count: number;
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
      case 'merge': return '#ef4444';
      case 'branch': return '#f59e0b';
      case 'linear': return '#3b82f6';
      default: return '#6b7280';
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        margin: '4px 0',
        fontSize: '11px',
        color: getConnectionColor(connection.type),
      }}
    >
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
  onCommitSelect,
}: {
  stackGraph: LayoutStackGraph;
  commitGraph: Record<CommitId, { commit: Commit; children: CommitId[] }>;
  selectedCommitId?: CommitId;
  currentCommitId?: CommitId;
  divergentChangeIds: ReadonlySet<ChangeId>;
  onCommitSelect: (commitId: CommitId) => void;
}) {
  useEffect(() => {
    console.log('📊 StackGraphComponent received new commitGraph with keys:', Object.keys(commitGraph));
  }, [commitGraph]);

  const { stacks, connections, rootStacks, leafStacks, parallelGroups } = stackGraph;

  const handleCommitSelect = (commitId: CommitId) => {
    onCommitSelect(commitId);
  };

  const stackToGroup = useMemo(() => {
    const map = new Map<StackId, ParallelGroup>();
    parallelGroups.forEach(group => {
      group.stackIds.forEach(stackId => {
        map.set(stackId, group);
      });
    });
    return map;
  }, [parallelGroups]);

  const layoutLevels = useMemo(() => {
    type LayoutItem = { type: 'stack'; stackId: StackId; isParallel?: boolean; parallelGroupId?: string };
    const levels: LayoutItem[][] = [];
    const visited = new Set<StackId>();

    const queue: { item: LayoutItem; level: number }[] = [];

    rootStacks.forEach(stackId => {
      queue.push({ item: { type: 'stack', stackId }, level: 0 });
      visited.add(stackId);
    });

    while (queue.length > 0) {
      const { item, level } = queue.shift()!;

      while (levels.length <= level) {
        levels.push([]);
      }

      levels[level].push(item);

      const stack = stacks[item.stackId];
      for (const childId of stack.childStacks) {
        if (visited.has(childId)) {
          continue;
        }
        const parallelGroup = stackToGroup.get(childId);
        const isParallel = Boolean(parallelGroup);
        queue.push({
          item: {
            type: 'stack',
            stackId: childId,
            isParallel,
            parallelGroupId: parallelGroup?.id,
          },
          level: level + 1,
        });
        visited.add(childId);
      }
    }

    console.log('🔧 Layout levels:', levels.map((level, index) => ({
      level: index,
      stacks: level.map(item => ({
        stackId: item.stackId,
        isParallel: item.isParallel,
        parallelGroupId: item.parallelGroupId,
      })),
    })));

    console.log('🔧 Parallel groups:', parallelGroups);

    return levels;
  }, [stacks, rootStacks, stackToGroup, parallelGroups]);

  const handleRootDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    const rootElement = event.currentTarget;
    applyRootDragState(rootElement, { active: true, meta: { kind: 'unknown' } });
    logRootDragState('dragstart:init', { active: true, meta: { kind: 'unknown' } }, []);
    const dataTransfer = event.dataTransfer ?? null;
    scheduleAfterDragStart(() => {
      const { state, types } = deriveRootDragState(dataTransfer);
      logRootDragState('dragstart:resolved', state, types);
      applyRootDragState(rootElement, state);
    });
  };

  const handleRootDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    const rootElement = event.currentTarget;
    const { state, types } = deriveRootDragState(event.dataTransfer ?? null);
    logRootDragState('dragenter', state, types);
    applyRootDragState(rootElement, state);
  };

  const handleRootDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) {
      return;
    }
    logRootDragState('dragleave', inactiveRootDragState, []);
    applyRootDragState(event.currentTarget, inactiveRootDragState);
  };

  const handleRootDragEnd = (event: React.DragEvent<HTMLDivElement>) => {
    logRootDragState('dragend', inactiveRootDragState, []);
    applyRootDragState(event.currentTarget, inactiveRootDragState);
    clearActiveDragMeta();
  };

  if (Object.keys(stacks).length === 0) {
    return (
      <div
        style={{
          height: '400px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          background: '#f9fafb',
        }}
      >
        <p style={{ color: '#6b7280' }}>No stacks to display</p>
      </div>
    );
  }

  return (
    <div
      data-stack-graph-root="true"
      onDragStartCapture={handleRootDragStart}
      onDragEnterCapture={handleRootDragEnter}
      onDragLeaveCapture={handleRootDragLeave}
      onDragEndCapture={handleRootDragEnd}
      style={{
        padding: '20px',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        background: '#fafafa',
      }}
    >
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '20px', color: '#111827' }}>
          📚 Commit Stack Graph
        </h2>
      </div>

      <div
        data-scroll-container
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0px',
          overflowY: 'auto',
          maxHeight: '80vh',
          position: 'relative',
        }}
      >
        {layoutLevels.slice().reverse().map((level, levelIndex) => {
          const actualLevelIndex = layoutLevels.length - 1 - levelIndex;
          const isLastLevel = levelIndex === layoutLevels.length - 1;

          return (
            <div key={actualLevelIndex}>
              <div
                style={{
                  display: 'flex',
                  gap: level.length > 1 ? '40px' : '16px',
                  flexWrap: 'nowrap',
                  alignItems: 'flex-start',
                  justifyContent: 'center',
                  position: 'relative',
                  overflowX: 'auto',
                  minWidth: '100%',
                  padding: '20px 0',
                }}
              >
                {level.map((item) => {
                  const stack = stacks[item.stackId];

                  return (
                    <div
                      key={item.stackId}
                      data-stack-id={item.stackId}
                      style={{
                        position: 'relative',
                        minWidth: '220px',
                        flexShrink: 0,
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

                return (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      padding: '8px 0',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '24px',
                        color: '#3b82f6',
                      }}
                    >
                      ↑
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {connections.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <details
            style={{
              background: 'white',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              padding: '16px',
            }}
          >
            <summary
              style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#374151',
                cursor: 'pointer',
                marginBottom: '8px',
              }}
            >
              View All Connections ({connections.length})
            </summary>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                maxHeight: '200px',
                overflowY: 'auto',
                marginTop: '12px',
              }}
            >
              {connections.map((connection, index) => (
                <ConnectionComponent key={index} connection={connection} />
              ))}
            </div>
          </details>
        </div>
      )}

      <details
        style={{
          marginTop: '16px',
          fontSize: '11px',
          color: '#9ca3af',
        }}
      >
        <summary style={{ cursor: 'pointer', fontSize: '12px' }}>
          Debug Info
        </summary>
        <div
          style={{
            fontFamily: 'monospace',
            marginTop: '8px',
            padding: '8px',
            background: '#f9fafb',
            borderRadius: '4px',
          }}
        >
          Root stacks: {rootStacks.join(', ')}<br />
          Leaf stacks: {leafStacks.join(', ')}
        </div>
      </details>
    </div>
  );
}
