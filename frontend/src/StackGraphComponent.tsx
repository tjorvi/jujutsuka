import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { match } from 'ts-pattern';
import type { ChangeId, CommitId, Commit, BookmarkName } from '../../backend/src/repo-parser';
import type { LayoutStackGraph, ParallelGroup, StackId } from './stackUtils';
import { draggedChange, draggedFileChange, draggedBookmark, draggedHunk, getActiveDragMeta, clearActiveDragMeta } from './useDragDrop';
import { StackComponent } from './StackComponent';

type DragMeta =
  | { kind: 'change'; commitId: CommitId; changeId: ChangeId }
  | { kind: 'file-change'; fromCommitId: CommitId; fromChangeId: ChangeId }
  | { kind: 'bookmark'; bookmarkName: BookmarkName }
  | { kind: 'hunk'; fromCommitId: CommitId; filePath: string }
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
    if (activeMeta.kind === 'bookmark') {
      return {
        kind: 'bookmark',
        bookmarkName: activeMeta.bookmarkName,
      };
    }
    if (activeMeta.kind === 'hunk') {
      return {
        kind: 'hunk',
        fromCommitId: activeMeta.fromCommitId,
        filePath: activeMeta.filePath,
      };
    }
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

  const hunk = draggedHunk({ dataTransfer });
  if (hunk) {
    return { kind: 'hunk', fromCommitId: hunk.fromCommitId, filePath: hunk.filePath };
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
      element.dataset.dragBookmarkName = String(meta.bookmarkName);
      delete element.dataset.dragCommitId;
      delete element.dataset.dragChangeId;
      delete element.dataset.dragFromCommitId;
      delete element.dataset.dragFromChangeId;
      delete element.dataset.dragFilePath;
      break;
    case 'hunk':
      element.dataset.dragFromCommitId = meta.fromCommitId;
      element.dataset.dragFilePath = meta.filePath;
      delete element.dataset.dragCommitId;
      delete element.dataset.dragChangeId;
      delete element.dataset.dragFromChangeId;
      delete element.dataset.dragBookmarkName;
      break;
    default:
      delete element.dataset.dragCommitId;
      delete element.dataset.dragChangeId;
      delete element.dataset.dragFromCommitId;
      delete element.dataset.dragFromChangeId;
      delete element.dataset.dragBookmarkName;
      delete element.dataset.dragFilePath;
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
  delete element.dataset.dragFilePath;
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

type MarkerKind = 'inbound' | 'outbound';

const connectorColor = '#6b7280';

interface NormalisedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
  readonly centerY: number;
}

interface MarkerMeasurementState {
  readonly containerSize: { readonly width: number; readonly height: number } | null;
  readonly markers: Record<StackId, {
    readonly inbound?: NormalisedRect;
    readonly outbound?: NormalisedRect;
  }>;
}

interface MarkerHandle {
  readonly element: SVGSVGElement;
  readonly observer: ResizeObserver | null;
}

interface MarkerRegistryEntry {
  inbound?: MarkerHandle;
  outbound?: MarkerHandle;
}

type MarkerRegistry = Map<StackId, MarkerRegistryEntry>;

interface MarkerRegistrationResult {
  readonly getMarkerCallback: (stackId: StackId, kind: MarkerKind) => (node: SVGSVGElement | null) => void;
  readonly measurements: MarkerMeasurementState;
  readonly scheduleRemeasure: () => void;
}

function toNormalisedRect(rect: DOMRect, containerRect: DOMRect): NormalisedRect {
  const offsetX = rect.left - containerRect.left;
  const offsetY = rect.top - containerRect.top;
  const width = rect.width;
  const height = rect.height;
  return {
    x: offsetX,
    y: offsetY,
    width,
    height,
    centerX: offsetX + width / 2,
    centerY: offsetY + height / 2,
  };
}

function useMarkerMeasurements(containerRef: React.RefObject<HTMLDivElement | null>): MarkerRegistrationResult {
  const registryRef = useRef<MarkerRegistry>(new Map());
  const rafIdRef = useRef<number | null>(null);
  const callbackCacheRef = useRef<Map<string, (node: SVGSVGElement | null) => void>>(new Map());
  const [measurements, setMeasurements] = useState<MarkerMeasurementState>({
    containerSize: null,
    markers: {},
  });

  const disconnectHandle = useCallback((handle: MarkerHandle | undefined) => {
    if (!handle) {
      return;
    }
    if (handle.observer) {
      handle.observer.disconnect();
    }
  }, []);

  const measureAll = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      setMeasurements((previous) => (previous.containerSize === null && Object.keys(previous.markers).length === 0)
        ? previous
        : { containerSize: null, markers: {} });
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const nextMarkers: MarkerMeasurementState['markers'] = {};

    registryRef.current.forEach((entry, stackId) => {
      const inboundRect = entry.inbound?.element.getBoundingClientRect();
      const outboundRect = entry.outbound?.element.getBoundingClientRect();

      if (!inboundRect && !outboundRect) {
        return;
      }

      nextMarkers[stackId] = {
        inbound: inboundRect ? toNormalisedRect(inboundRect, containerRect) : undefined,
        outbound: outboundRect ? toNormalisedRect(outboundRect, containerRect) : undefined,
      };
    });

    setMeasurements({
      containerSize: { width: containerRect.width, height: containerRect.height },
      markers: nextMarkers,
    });
  }, [containerRef]);

  const scheduleRemeasure = useCallback(() => {
    if (rafIdRef.current !== null) {
      return;
    }
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      rafIdRef.current = window.requestAnimationFrame(() => {
        rafIdRef.current = null;
        measureAll();
      });
      return;
    }
    measureAll();
  }, [measureAll]);

  const registerMarker = useCallback((
    stackId: StackId,
    kind: MarkerKind,
    node: SVGSVGElement | null,
  ) => {
    const registry = registryRef.current;
    const existingEntry = registry.get(stackId);
    const existingHandle = existingEntry?.[kind];

    if (existingHandle && existingHandle.element === node) {
      return;
    }

    if (existingHandle) {
      disconnectHandle(existingHandle);
    }

    if (!node) {
      if (!existingEntry) {
        return;
      }
      const nextEntry: MarkerRegistryEntry = { ...existingEntry };
      delete nextEntry[kind];
      if (!nextEntry.inbound && !nextEntry.outbound) {
        registry.delete(stackId);
      } else {
        registry.set(stackId, nextEntry);
      }
      scheduleRemeasure();
      return;
    }

    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
        scheduleRemeasure();
      })
      : null;

    if (observer) {
      observer.observe(node);
    }

    const nextEntry: MarkerRegistryEntry = {
      ...(existingEntry ?? {}),
      [kind]: {
        element: node,
        observer,
      } satisfies MarkerHandle,
    };

    registry.set(stackId, nextEntry);
    scheduleRemeasure();
  }, [disconnectHandle, scheduleRemeasure]);

  const getMarkerCallback = useCallback((stackId: StackId, kind: MarkerKind) => {
    const cacheKey = `${stackId}:${kind}`;
    const cached = callbackCacheRef.current.get(cacheKey);
    if (cached) {
      return cached;
    }
    const callback = (node: SVGSVGElement | null) => {
      registerMarker(stackId, kind, node);
    };
    callbackCacheRef.current.set(cacheKey, callback);
    return callback;
  }, [registerMarker]);

  useLayoutEffect(() => {
    scheduleRemeasure();
  }, [scheduleRemeasure]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(() => {
      scheduleRemeasure();
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, [containerRef, scheduleRemeasure]);

  useEffect(() => () => {
    if (rafIdRef.current !== null) {
      if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(rafIdRef.current);
      }
      rafIdRef.current = null;
    }
    registryRef.current.forEach((entry) => {
      disconnectHandle(entry.inbound);
      disconnectHandle(entry.outbound);
    });
    registryRef.current.clear();
    callbackCacheRef.current.clear();
  }, [disconnectHandle]);

  return {
    getMarkerCallback,
    measurements,
    scheduleRemeasure,
  };
}

interface ConnectionComponentProps {
  connection: {
    from: StackId;
    to: StackId;
    type: 'linear' | 'merge' | 'branch';
  };
}

function getConnectionColor(type: 'linear' | 'merge' | 'branch'): string {
  return match(type)
    .with('merge', () => '#ef4444')
    .with('branch', () => '#f59e0b')
    .with('linear', () => '#3b82f6')
    .exhaustive();
}

function ConnectionComponent({ connection }: ConnectionComponentProps) {
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

interface ArrowOverlayProps {
  readonly containerSize: MarkerMeasurementState['containerSize'];
  readonly markers: MarkerMeasurementState['markers'];
  readonly connections: LayoutStackGraph['connections'];
}

function ArrowOverlay({ containerSize, markers, connections }: ArrowOverlayProps) {
  if (!containerSize) {
    return null;
  }

  const { width, height } = containerSize;
  const strokeColor = connectorColor;

  const usableConnections = connections
    .map((connection) => {
      const outbound = markers[connection.from]?.outbound;
      const inbound = markers[connection.to]?.inbound;
      if (!outbound || !inbound) {
        return null;
      }

      const outboundX = outbound.centerX;
      const outboundY = outbound.centerY;
      const inboundX = inbound.centerX;
      const inboundY = inbound.y + inbound.height;

      const midControl = Math.max(Math.abs(inboundY - outboundY) * 0.35, 24);
      const controlYOffset = outboundY <= inboundY
        ? midControl
        : -midControl;

      const path = [
        `M ${outboundX} ${outboundY}`,
        `C ${outboundX} ${outboundY + controlYOffset}`,
        `${inboundX} ${inboundY - controlYOffset}`,
        `${inboundX} ${inboundY}`,
      ].join(' ');

      return {
        key: `${connection.from}->${connection.to}`,
        path,
        type: connection.type,
      };
    })
    .filter((value): value is { key: string; path: string; type: 'linear' | 'merge' | 'branch' } => value !== null);

  if (usableConnections.length === 0) {
    return null;
  }

  return (
    <svg
      width={width}
      height={height}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      {usableConnections.map((connection) => (
        <path
          key={connection.key}
          d={connection.path}
          fill="none"
          stroke={strokeColor}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { getMarkerCallback, measurements, scheduleRemeasure } = useMarkerMeasurements(containerRef);

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

  useEffect(() => {
    scheduleRemeasure();
  }, [layoutLevels, scheduleRemeasure]);

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
    const nextTarget = event.relatedTarget;
    // Check if relatedTarget is a Node before using contains
    if (nextTarget && nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
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
        ref={containerRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0px',
          overflowY: 'auto',
          maxHeight: '80vh',
          position: 'relative',
        }}
      >
        <ArrowOverlay
          containerSize={measurements.containerSize}
          markers={measurements.markers}
          connections={connections}
        />
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
                        maxWidth: '340px',
                        width: '100%',
                        flexShrink: 0,
                      }}
                    >
                      <OutboundMarker assign={getMarkerCallback(item.stackId, 'outbound')} />
                      <StackComponent
                        stack={stack}
                        commitGraph={commitGraph}
                        isInParallelGroup={item.isParallel}
                        selectedCommitId={selectedCommitId}
                        currentCommitId={currentCommitId}
                        divergentChangeIds={divergentChangeIds}
                        onCommitSelect={handleCommitSelect}
                      />
                      <InboundMarker assign={getMarkerCallback(item.stackId, 'inbound')} />
                    </div>
                  );
                })}
              </div>

              {!isLastLevel && (
                <div
                  style={{
                    height: '24px',
                  }}
                />
              )}
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

interface StackMarkerProps {
  readonly assign: (node: SVGSVGElement | null) => void;
}

function InboundMarker({ assign }: StackMarkerProps) {
  return <svg
    ref={assign}
    width="12"
    height="12"
    style={{
      display: 'block',
      margin: '0 auto',
    }}
  >
    <path d="M0,12 L6,0 L12,12" fill={connectorColor} />
  </svg>;
}

function OutboundMarker({ assign }: StackMarkerProps) {
  return <svg
    ref={assign}
    width="12"
    height="12"
    style={{
      display: 'block',
      margin: '0 auto',
    }}
  >
    <circle r="2" cx="6" cy="6" fill={connectorColor} />
  </svg>;
}
