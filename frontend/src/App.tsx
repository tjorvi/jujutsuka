import './App.css'
import { StackGraphComponent } from './StackGraph';
import { FileListPanel } from './FileListPanel';
import { DiffPanel } from './DiffPanel';
import { Settings } from './Settings';
import { DragDropProvider } from './DragDropContext';
import { useState, useEffect } from 'react';
import type { CommitId } from "../../backend/src/repo-parser";
import { useGraphData } from './useGraphData';
import { useGraphStore } from './graphStore';
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
  const [expandedSnapshots, setExpandedSnapshots] = useState<Set<number>>(new Set());
  const [highlightedOps, setHighlightedOps] = useState<Set<string>>(new Set());
  const currentCommitId = useGraphStore(state => state.currentCommitId);
  const operationLog = useGraphStore(state => state.operationLog);

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
    if (!repoDirectory) return;
    try {
      await trpc.undo.mutate({ repoPath: repoDirectory });
    } catch (error) {
      console.error('Undo failed:', error);
    }
  };

  const handleRedo = async () => {
    if (!repoDirectory) return;
    try {
      await trpc.redo.mutate({ repoPath: repoDirectory });
    } catch (error) {
      console.error('Redo failed:', error);
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

      {/* Content - horizontal layout */}
      <div style={{ display: 'flex', height: 'calc(100vh - 80px)' }}>
        {/* Main content area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {showOpLog ? (
            /* Operation Log View */
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
              <h2 style={{ fontSize: '20px', marginBottom: '16px', color: '#e5e7eb' }}>
                📋 Operation Log
              </h2>

              {!operationLog && (
                <p style={{ color: '#9ca3af' }}>Loading operation log...</p>
              )}

              {operationLog && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  {operationLog.length === 0 ? (
                    <p style={{ color: '#9ca3af' }}>No operations found</p>
                  ) : (
                    (() => {
                      // Build a map for quick lookup
                      const opMap = new Map<string, typeof operationLog[0]>();
                      operationLog.forEach(entry => {
                        opMap.set(entry.fullOperationId, entry);
                      });

                      // Helper to extract target operation ID from undo/redo description
                      function extractTargetOperationId(description: string): string | null {
                        const match = description.match(/restore to operation ([a-f0-9]+)/);
                        return match ? match[1] : null;
                      }

                      // Follow the chain of undo/redo operations and return all IDs in the chain
                      function followChain(startOpId: string): Set<string> {
                        const chain = new Set<string>();
                        let currentId: string | null = startOpId;
                        const visited = new Set<string>(); // Prevent infinite loops

                        while (currentId && !visited.has(currentId)) {
                          visited.add(currentId);
                          chain.add(currentId);

                          const op = opMap.get(currentId);
                          if (!op) break;

                          const isUndoOrRedo = op.operationDescription.startsWith('undo:') ||
                                               op.operationDescription.startsWith('redo:');
                          if (!isUndoOrRedo) break;

                          currentId = extractTargetOperationId(op.operationDescription);
                        }

                        return chain;
                      }

                      // Group consecutive snapshots
                      const groups: Array<{ type: 'single' | 'snapshots'; entries: typeof operationLog }> = [];
                      let currentSnapshotGroup: typeof operationLog = [];

                      operationLog.forEach((entry, idx) => {
                        const isSnapshot = entry.operationDescription === 'snapshot working copy';
                        if (isSnapshot) {
                          currentSnapshotGroup.push(entry);
                        } else {
                          if (currentSnapshotGroup.length > 0) {
                            groups.push({ type: 'snapshots', entries: currentSnapshotGroup });
                            currentSnapshotGroup = [];
                          }
                          groups.push({ type: 'single', entries: [entry] });
                        }
                      });
                      if (currentSnapshotGroup.length > 0) {
                        groups.push({ type: 'snapshots', entries: currentSnapshotGroup });
                      }

                      return groups.map((group, groupIdx) => {
                        if (group.type === 'snapshots' && group.entries.length > 1) {
                          const isExpanded = expandedSnapshots.has(groupIdx);
                          return (
                            <div key={`group-${groupIdx}`}>
                              <div
                                onClick={() => {
                                  const newExpanded = new Set(expandedSnapshots);
                                  if (isExpanded) {
                                    newExpanded.delete(groupIdx);
                                  } else {
                                    newExpanded.add(groupIdx);
                                  }
                                  setExpandedSnapshots(newExpanded);
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
                                  {group.entries.length} snapshots
                                </span>
                              </div>
                              {isExpanded && (
                                <div style={{ marginLeft: '24px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  {group.entries.map((entry) => renderOperation(entry))}
                                </div>
                              )}
                            </div>
                          );
                        } else {
                          return group.entries.map((entry) => renderOperation(entry));
                        }
                      });

                      function renderOperation(entry: typeof operationLog[0]) {
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

                        // Extract target operation ID if this is an undo/redo
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
                      }
                    })()
                  )}
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
