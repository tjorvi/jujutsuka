import './App.css'
import { StackGraphComponent } from './StackGraph';
import { FileListPanel } from './FileListPanel';
import { DiffPanel } from './DiffPanel';
import { Settings } from './Settings';
import { DragDropProvider } from './DragDropContext';
import { useState, useEffect, useMemo } from 'react';
import { LatestUiOperationPanel } from './LatestUiOperationPanel';
import type { CommitId, OpLogEntry } from "../../backend/src/repo-parser";
import { useGraphData } from './useGraphData';
import { useGraphStore } from './graphStore';
import type { UiOperationLogEntry } from './graphStore';
import { useDragState } from './useDragState';
import { trpc } from './api';

const REPO_DIR_KEY = 'jwarrior-repo-directory';

function App() {
  // Set up global drag state on document body
  useDragState();
  const [repoDirectory, setRepoDirectory] = useState<string>(() => {
    return localStorage.getItem(REPO_DIR_KEY) || '';
  });
  const setRepoPath = useGraphStore(state => state.setRepoPath);

  const {
    isLoading,
    hasError,
    isSuccess,
    isExecutingCommand,
    error,
    stackGraph,
    commitGraph
  } = useGraphData();
  const [selectedCommitId, setSelectedCommitId] = useState<CommitId | undefined>();
  const [selectedFilePath, setSelectedFilePath] = useState<string | undefined>();
  const [evologPreviewCommitId, setEvologPreviewCommitId] = useState<CommitId | undefined>();
  const [showSettings, setShowSettings] = useState(false);
  const [showOpLog, setShowOpLog] = useState(false);
  const [expandedSnapshots, setExpandedSnapshots] = useState<Set<string>>(new Set());
  const [highlightedOps, setHighlightedOps] = useState<Set<string>>(new Set());
  const [includeUiInOpLog, setIncludeUiInOpLog] = useState(true);
  const [isUiPanelExpanded, setIsUiPanelExpanded] = useState(false);
  const currentCommitId = useGraphStore(state => state.currentCommitId);
  const operationLog = useGraphStore(state => state.operationLog);
  const divergentChangeIds = useGraphStore(state => state.divergentChangeIds);
  const logUiOperation = useGraphStore(state => state.logUiOperation);
  const updateUiOperationStatus = useGraphStore(state => state.updateUiOperationStatus);
  const uiOperationLog = useGraphStore(state => state.uiOperationLog);

  // Save directory to localStorage and sync to store whenever it changes
  useEffect(() => {
    if (repoDirectory) {
      localStorage.setItem(REPO_DIR_KEY, repoDirectory);
    }
    setRepoPath(repoDirectory);
  }, [repoDirectory, setRepoPath]);

  // Reset selected file when commit changes
  const handleCommitSelect = (commitId: CommitId | undefined) => {
    setSelectedCommitId(commitId);
    setSelectedFilePath(undefined);
    setEvologPreviewCommitId(undefined);
  };

  useEffect(() => {
    if (!currentCommitId) return;
    setSelectedCommitId(prev => prev ?? currentCommitId);
  }, [currentCommitId]);

  const viewCommitId = evologPreviewCommitId ?? selectedCommitId;

  useEffect(() => {
    setSelectedFilePath(undefined);
  }, [viewCommitId]);

  // Handlers for undo/redo
  const handleUndo = async () => {
    const operationId = logUiOperation({
      description: 'Undo last operation via UI',
      kind: { type: 'button', button: 'undo' },
    });
    if (!repoDirectory) {
      updateUiOperationStatus(operationId, 'failed', 'Repository path is not set');
      return;
    }
    try {
      await trpc.undo.mutate({ repoPath: repoDirectory });
      updateUiOperationStatus(operationId, 'succeeded');
    } catch (error) {
      console.error('Undo failed:', error);
      const message = error instanceof Error ? error.message : String(error);
      updateUiOperationStatus(operationId, 'failed', message);
      throw error;
    }
  };

  const handleRedo = async () => {
    const operationId = logUiOperation({
      description: 'Redo last operation via UI',
      kind: { type: 'button', button: 'redo' },
    });
    if (!repoDirectory) {
      updateUiOperationStatus(operationId, 'failed', 'Repository path is not set');
      return;
    }
    try {
      await trpc.redo.mutate({ repoPath: repoDirectory });
      updateUiOperationStatus(operationId, 'succeeded');
    } catch (error) {
      console.error('Redo failed:', error);
      const message = error instanceof Error ? error.message : String(error);
      updateUiOperationStatus(operationId, 'failed', message);
      throw error;
    }
  };

  // Humanize timestamp to relative time
  const humanizeTime = (timestamp: string): string => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 10) return 'just now';
    if (diffSecs < 60) return `${diffSecs}s ago`;
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return timestamp.split(' ')[0]; // Return just the date if older than a week
  };

  // Shorten long operation IDs in descriptions for display
  const shortenOpDescription = (description: string): string => {
    // Replace long hex strings (64+ chars) with shortened versions (12 chars)
    return description.replace(/([a-f0-9]{64,})/g, (match) => match.substring(0, 12) + '...');
  };

  const parseOpTimestamp = (timestamp: string): number => {
    const isoLike = timestamp.replace(' ', 'T');
    const parsed = Date.parse(isoLike);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
    const parsedWithZ = Date.parse(`${isoLike}Z`);
    if (!Number.isNaN(parsedWithZ)) {
      return parsedWithZ;
    }
    return Date.now();
  };

  type OperationTimelineEntry =
    | { kind: 'operation'; entry: OpLogEntry; timestampMs: number; key: string }
    | { kind: 'snapshot-group'; entries: OpLogEntry[]; timestampMs: number; key: string };

  type TimelineEntry =
    | (OperationTimelineEntry & { sequence: number })
    | { kind: 'ui'; entry: UiOperationLogEntry; timestampMs: number; key: string; sequence: number };

  const operationTimeline: OperationTimelineEntry[] = useMemo(() => {
    if (!operationLog) {
      return [];
    }

    const timeline: OperationTimelineEntry[] = [];
    let snapshotBuffer: OpLogEntry[] = [];
    let snapshotGroupCount = 0;

    for (const entry of operationLog) {
      const isSnapshot = entry.operationDescription === 'snapshot working copy';
      if (isSnapshot) {
        snapshotBuffer.push(entry);
        continue;
      }

      if (snapshotBuffer.length > 0) {
        const groupKey = `snapshots-${snapshotGroupCount}`;
        timeline.push({
          kind: 'snapshot-group',
          entries: snapshotBuffer,
          timestampMs: parseOpTimestamp(snapshotBuffer[0].timestamp),
          key: groupKey,
        });
        snapshotGroupCount += 1;
        snapshotBuffer = [];
      }

      timeline.push({
        kind: 'operation',
        entry,
        timestampMs: parseOpTimestamp(entry.timestamp),
        key: entry.fullOperationId,
      });
    }

    if (snapshotBuffer.length > 0) {
      const groupKey = `snapshots-${snapshotGroupCount}`;
      timeline.push({
        kind: 'snapshot-group',
        entries: snapshotBuffer,
        timestampMs: parseOpTimestamp(snapshotBuffer[0].timestamp),
        key: groupKey,
      });
    }

    return timeline;
  }, [operationLog]);

  const timelineEntries: TimelineEntry[] = useMemo(() => {
    const base = operationTimeline.map((entry, index) => ({
      ...entry,
      sequence: index,
    }));

    if (!includeUiInOpLog) {
      return base;
    }

    const uiEntries = uiOperationLog.map((entry, index) => {
      const parsed = Date.parse(entry.timestamp);
      const timestampMs = Number.isNaN(parsed) ? Date.now() : parsed;
      return {
        kind: 'ui' as const,
        entry,
        timestampMs,
        key: entry.id,
        sequence: base.length + index,
      };
    });

    const combined = [...base, ...uiEntries];
    combined.sort((a, b) => {
      if (a.timestampMs !== b.timestampMs) {
        return b.timestampMs - a.timestampMs;
      }
      return a.sequence - b.sequence;
    });

    return combined;
  }, [operationTimeline, includeUiInOpLog, uiOperationLog]);

  const latestUiOperation = uiOperationLog.length > 0 ? uiOperationLog[uiOperationLog.length - 1] : undefined;

  const operationsAfterLatestUi: readonly OpLogEntry[] = useMemo(() => {
    if (!latestUiOperation || !operationLog) {
      return [];
    }
    const pivot = latestUiOperation.opLogHeadAtCreation;
    if (!pivot) {
      return operationLog;
    }

    const entries: OpLogEntry[] = [];
    for (const entry of operationLog) {
      if (entry.fullOperationId === pivot) {
        break;
      }
      entries.push(entry);
    }
    return entries;
  }, [latestUiOperation, operationLog]);

  const opMap = useMemo(() => {
    const map = new Map<string, OpLogEntry>();
    if (operationLog) {
      for (const entry of operationLog) {
        map.set(entry.fullOperationId, entry);
      }
    }
    return map;
  }, [operationLog]);

  const extractTargetOperationId = (description: string): string | null => {
    const match = description.match(/restore to operation ([a-f0-9]+)/);
    return match ? match[1] : null;
  };

  const followChain = (startOpId: string): Set<string> => {
    const chain = new Set<string>();
    let currentId: string | null = startOpId;
    const visited = new Set<string>();

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      chain.add(currentId);
      const op = opMap.get(currentId);
      if (!op) {
        break;
      }

      const isUndoOrRedo = op.operationDescription.startsWith('undo:') ||
        op.operationDescription.startsWith('redo:');
      if (!isUndoOrRedo) {
        break;
      }
      currentId = extractTargetOperationId(op.operationDescription);
    }

    return chain;
  };

  const assertNeverKind = (value: never): never => {
    throw new Error(`Unhandled UI operation kind: ${JSON.stringify(value)}`);
  };

  const renderOperationCard = (entry: OpLogEntry) => {
    const isUndo = entry.operationDescription.startsWith('undo:');
    const isRedo = entry.operationDescription.startsWith('redo:');
    const isSnapshot = entry.operationDescription === 'snapshot working copy';
    const isHighlighted = highlightedOps.has(entry.fullOperationId);

    const getOpStyle = () => {
      if (isUndo) return { bg: '#fef3c7', border: '#fbbf24', icon: '↶' };
      if (isRedo) return { bg: '#dbeafe', border: '#3b82f6', icon: '↷' };
      if (isSnapshot) return { bg: '#f3f4f6', border: '#d1d5db', icon: '📸' };
      return { bg: '#ffffff', border: '#e5e7eb', icon: '⚙️' };
    };

    const style = getOpStyle();
    const targetOpId = (isUndo || isRedo) ? extractTargetOperationId(entry.operationDescription) : null;

    return (
      <div
        key={entry.operationId}
        onMouseEnter={() => {
          if (targetOpId) {
            const chain = followChain(targetOpId);
            setHighlightedOps(chain);
          }
        }}
        onMouseLeave={() => {
          if (targetOpId) {
            setHighlightedOps(new Set());
          }
        }}
        style={{
          padding: '12px 16px',
          background: isHighlighted ? '#fde047' : style.bg,
          border: isHighlighted ? '2px solid #eab308' : `1px solid ${style.border}`,
          borderRadius: '6px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          opacity: isSnapshot ? 0.6 : 1,
          cursor: (isUndo || isRedo) ? 'pointer' : 'default',
          boxShadow: isHighlighted ? '0 0 0 3px rgba(234, 179, 8, 0.3)' : 'none',
        }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px' }}>{style.icon}</span>
            <span style={{
              fontFamily: 'monospace',
              fontSize: '12px',
              color: '#6b7280',
              fontWeight: '500',
            }}>
              {entry.operationId}
            </span>
          </div>
          <span
            title={entry.timestamp}
            style={{
              fontSize: '12px',
              color: '#9ca3af',
              cursor: 'help',
            }}
          >
            {humanizeTime(entry.timestamp)}
          </span>
        </div>
        <div
          title={entry.operationDescription}
          style={{
            fontSize: '14px',
            color: '#1f2937',
            fontWeight: isSnapshot ? '400' : '500',
          }}
        >
          {shortenOpDescription(entry.operationDescription)}
        </div>
        <div style={{
          fontSize: '12px',
          color: '#6b7280',
        }}>
          User: {entry.user}
        </div>
      </div>
    );
  };

  const renderSnapshotGroupCard = (groupKey: string, entries: readonly OpLogEntry[]) => {
    const singleEntry = entries[0];
    if (!singleEntry) {
      return null;
    }
    if (entries.length === 1) {
      return renderOperationCard(singleEntry);
    }

    const isExpanded = expandedSnapshots.has(groupKey);

    return (
      <div key={groupKey}>
        <div
          onClick={() => {
            const next = new Set(expandedSnapshots);
            if (isExpanded) {
              next.delete(groupKey);
            } else {
              next.add(groupKey);
            }
            setExpandedSnapshots(next);
          }}
          style={{
            padding: '12px 16px',
            background: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            cursor: 'pointer',
            opacity: 0.6,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '14px' }}>{isExpanded ? '▼' : '▶'}</span>
          <span style={{ fontSize: '14px' }}>📸</span>
          <span style={{ fontSize: '14px', color: '#6b7280' }}>
            {entries.length} snapshots
          </span>
        </div>
        {isExpanded && (
          <div style={{ marginLeft: '24px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {entries.map((entry) => renderOperationCard(entry))}
          </div>
        )}
      </div>
    );
  };

  const renderUiOperationCard = (entry: UiOperationLogEntry) => {
    const statusStyle = (() => {
      switch (entry.status) {
        case 'succeeded':
          return { bg: '#dcfce7', border: '#22c55e', label: 'Success' };
        case 'failed':
          return { bg: '#fee2e2', border: '#ef4444', label: 'Failure' };
        default:
          return { bg: '#f3f4f6', border: '#d1d5db', label: 'Triggered' };
      }
    })();

    const contextLabel = (() => {
      switch (entry.kind.type) {
        case 'intention-command':
          return `Command: ${entry.kind.command.type}`;
        case 'legacy-command':
          return `Legacy command: ${entry.kind.command.type}`;
        case 'button':
          return `Button: ${entry.kind.button}`;
        default:
          return assertNeverKind(entry.kind);
      }
    })();

    return (
      <div
        key={entry.id}
        style={{
          padding: '12px 16px',
          background: statusStyle.bg,
          border: `1px solid ${statusStyle.border}`,
          borderRadius: '6px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
        }}>
          <span style={{
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#374151',
            fontWeight: 500,
          }}>
            {entry.id}
          </span>
          <span style={{ fontSize: '12px', color: '#6b7280' }}>
            {humanizeTime(entry.timestamp)}
          </span>
        </div>
        <div style={{ fontSize: '14px', color: '#111827', fontWeight: 500 }}>
          {entry.description}
        </div>
        <div style={{ fontSize: '12px', color: '#4b5563' }}>
          {contextLabel} · Status: {statusStyle.label}
        </div>
        {entry.errorMessage && (
          <div style={{ fontSize: '12px', color: '#b91c1c' }}>
            Error: {entry.errorMessage}
          </div>
        )}
        {entry.opLogHeadAtCreation && (
          <div style={{ fontSize: '11px', color: '#6b7280' }}>
            Op head recorded as {entry.opLogHeadAtCreation.slice(0, 12)}
          </div>
        )}
      </div>
    );
  };

  return (
    <DragDropProvider>
      {/* Header */}
      <div style={{
        padding: '20px',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px',
      }}>
        <h1 style={{ margin: '0', fontSize: '24px', flexShrink: 0 }}>
          📚 Jujutsu Stacks {isExecutingCommand && <span style={{ color: '#f59e0b', fontSize: '14px' }}>(executing...)</span>}
        </h1>

        {/* Repository Directory Input */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label htmlFor="repo-dir" style={{ fontSize: '14px', color: '#6b7280', flexShrink: 0 }}>
            Repo:
          </label>
          <input
            id="repo-dir"
            type="text"
            value={repoDirectory}
            onChange={(e) => setRepoDirectory(e.target.value)}
            placeholder="/path/to/jj/repository"
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              fontSize: '14px',
              fontFamily: 'monospace',
              backgroundColor: '#ffffff',
              color: '#1f2937',
            }}
          />
        </div>

        <button
          onClick={handleUndo}
          disabled={!repoDirectory}
          style={{
            padding: '8px 16px',
            background: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            cursor: repoDirectory ? 'pointer' : 'not-allowed',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: repoDirectory ? '#374151' : '#9ca3af',
            flexShrink: 0,
            opacity: repoDirectory ? 1 : 0.5,
          }}
          title="Undo last operation"
        >
          ↶ Undo
        </button>

        <button
          onClick={handleRedo}
          disabled={!repoDirectory}
          style={{
            padding: '8px 16px',
            background: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            cursor: repoDirectory ? 'pointer' : 'not-allowed',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: repoDirectory ? '#374151' : '#9ca3af',
            flexShrink: 0,
            opacity: repoDirectory ? 1 : 0.5,
          }}
          title="Redo last undone operation"
        >
          ↷ Redo
        </button>

        <button
          onClick={() => setShowOpLog(!showOpLog)}
          disabled={!repoDirectory}
          style={{
            padding: '8px 16px',
            background: showOpLog ? '#3b82f6' : '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            cursor: repoDirectory ? 'pointer' : 'not-allowed',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: showOpLog ? '#ffffff' : (repoDirectory ? '#374151' : '#9ca3af'),
            flexShrink: 0,
            opacity: repoDirectory ? 1 : 0.5,
          }}
          title="Toggle operation log"
        >
          📋 Op Log
        </button>

        <button
          onClick={() => setShowSettings(true)}
          style={{
            padding: '8px 16px',
            background: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: '#374151',
            flexShrink: 0,
          }}
        >
          ⚙️ Settings
        </button>
      </div>

      {latestUiOperation && (
        <LatestUiOperationPanel
          latestUiOperation={latestUiOperation}
          operationsAfter={operationsAfterLatestUi}
          humanizeTime={humanizeTime}
          shortenOpDescription={shortenOpDescription}
          isExpanded={isUiPanelExpanded}
          onToggle={() => setIsUiPanelExpanded(prev => !prev)}
        />
      )}

      {/* Content - horizontal layout */}
      <div style={{ display: 'flex', height: 'calc(100vh - 80px)' }}>
        {/* Main content area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {showOpLog ? (
            /* Operation Log View */
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', gap: '16px' }}>
                <h2 style={{ fontSize: '20px', color: '#e5e7eb', margin: 0 }}>
                  📋 Operation Log
                </h2>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#d1d5db' }}>
                  <input
                    type="checkbox"
                    checked={includeUiInOpLog}
                    onChange={(event) => setIncludeUiInOpLog(event.target.checked)}
                  />
                  Show UI events
                </label>
              </div>

              {!operationLog && (
                <p style={{ color: '#9ca3af' }}>Loading operation log...</p>
              )}

              {timelineEntries.length === 0 ? (
                <p style={{ color: '#9ca3af' }}>No operations or UI events recorded yet</p>
              ) : (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  {timelineEntries.map((entry) => {
                    if (entry.kind === 'operation') {
                      return renderOperationCard(entry.entry);
                    }
                    if (entry.kind === 'snapshot-group') {
                      return renderSnapshotGroupCard(entry.key, entry.entries);
                    }
                    return renderUiOperationCard(entry.entry);
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Normal Stack Graph View */
            <>
              {isLoading && <p>Loading...</p>}
              {hasError && (
                <p>Error: {String(error)}</p>
              )}
              {isSuccess && stackGraph && commitGraph && (
                <StackGraphComponent
                  stackGraph={stackGraph}
                  commitGraph={commitGraph}
                  selectedCommitId={selectedCommitId}
                  currentCommitId={currentCommitId ?? undefined}
                  divergentChangeIds={divergentChangeIds}
                  onCommitSelect={handleCommitSelect}
                />
              )}
            </>
          )}
        </div>

        {/* File list panel */}
        <FileListPanel 
          selectedCommitId={selectedCommitId} 
          viewCommitId={viewCommitId}
          evologPreviewCommitId={evologPreviewCommitId}
          onEvologPreviewSelect={setEvologPreviewCommitId}
          onFileSelect={setSelectedFilePath}
          selectedFilePath={selectedFilePath}
        />

        {/* Diff panel */}
        <DiffPanel 
          commitId={viewCommitId}
          selectedFilePath={selectedFilePath}
          isPreview={Boolean(evologPreviewCommitId)}
        />
      </div>

      {/* Settings Modal */}
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </DragDropProvider>
  )
}

export default App
