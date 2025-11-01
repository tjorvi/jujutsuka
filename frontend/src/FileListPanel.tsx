import { useEffect, useMemo, useState, type MouseEvent, type FormEvent } from 'react';
import { queries, useQuery, trpc } from './api';
import type { CommitId } from "../../backend/src/repo-parser";
import { createBookmarkName } from "./brandedTypes";
import { llmService } from './llmService';
import { useGraphStore } from './graphStore';
import { draggedFileChange } from './useDragDrop';
import styles from './FileListPanel.module.css';
import { z } from 'zod';

interface FileListPanelProps {
  selectedCommitId?: CommitId;
  viewCommitId?: CommitId;
  evologPreviewCommitId?: CommitId;
  onEvologPreviewSelect?: (commitId: CommitId | undefined) => void;
  onFileSelect?: (filePath: string) => void;
  selectedFilePath?: string;
}

const sidebarViews = ['details', 'evolog'] as const;
type SidebarView = typeof sidebarViews[number];
const sidebarViewLabels: Record<SidebarView, string> = {
  details: 'Details',
  evolog: 'Evolution Log',
} as const;

// Helper function to create a visual size indicator
function getSizeIndicator(additions?: number, deletions?: number) {
  if (additions === undefined || deletions === undefined) {
    return null;
  }
  
  const total = additions + deletions;
  
  // Categorize size
  let bars = 1;
  if (total > 100) bars = 5;
  else if (total > 50) bars = 4;
  else if (total > 20) bars = 3;
  else if (total > 5) bars = 2;
  
  const additionRatio = total > 0 ? additions / total : 0.5;
  const additionBars = Math.round(bars * additionRatio);
  const deletionBars = bars - additionBars;
  
  return (
    <div style={{ display: 'flex', gap: '1px', alignItems: 'center' }}>
      {Array(additionBars).fill(0).map((_, i) => (
        <div key={`add-${i}`} style={{ 
          width: '3px', 
          height: '8px', 
          background: '#10b981',
          borderRadius: '1px'
        }} />
      ))}
      {Array(deletionBars).fill(0).map((_, i) => (
        <div key={`del-${i}`} style={{ 
          width: '3px', 
          height: '8px', 
          background: '#ef4444',
          borderRadius: '1px'
        }} />
      ))}
    </div>
  );
}

export function FileListPanel({
  selectedCommitId,
  viewCommitId,
  evologPreviewCommitId,
  onEvologPreviewSelect,
  onFileSelect,
  selectedFilePath,
}: FileListPanelProps) {
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [loadingSummaries, setLoadingSummaries] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [draggingFilePath, setDraggingFilePath] = useState<string | null>(null);
  const repoPath = useGraphStore(state => state.repoPath);
  const commitGraph = useGraphStore(state => state.commitGraph);
  const updateChangeDescription = useGraphStore(state => state.updateChangeDescription);
  const splitAtEvoLog = useGraphStore(state => state.splitAtEvoLog);
  const isExecutingCommand = useGraphStore(state => state.isExecutingCommand);
  const bookmarksByCommit = useGraphStore(state => state.bookmarksByCommit);
  const addBookmark = useGraphStore(state => state.addBookmark);
  const deleteBookmark = useGraphStore(state => state.deleteBookmark);
  const abandonChange = useGraphStore(state => state.abandonChange);
  const checkoutChange = useGraphStore(state => state.checkoutChange);
  const currentCommitId = useGraphStore(state => state.currentCommitId);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [newBookmarkName, setNewBookmarkName] = useState('');
  const [bookmarkError, setBookmarkError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<SidebarView>('details');

  // Use a placeholder commit ID when none is selected, and handle it in the render
  const fileChanges = useQuery(
    queries.fileChanges,
    { repoPath, commitId: viewCommitId || '' },
    { enabled: !!repoPath && !!viewCommitId }
  );

  const evolog = useQuery(
    queries.evolog,
    { repoPath, commitId: selectedCommitId || '' },
    { enabled: !!repoPath && !!selectedCommitId }
  );

  // Get the changeId for the selected commit
  const selectedCommit = selectedCommitId && commitGraph ? commitGraph[selectedCommitId]?.commit : null;
  const isPreviewingEvologEntry = Boolean(evologPreviewCommitId);
  const activeCommitId = viewCommitId ?? selectedCommitId;
  const selectedChangeId = selectedCommit?.changeId;
  const selectedCommitBookmarks = selectedCommitId ? (bookmarksByCommit[selectedCommitId] ?? []) : [];
  const isCurrentChange = selectedCommitId !== undefined && currentCommitId === selectedCommitId;
  const checkoutDisabled = selectedCommitId === undefined || isExecutingCommand || isCurrentChange;
  const checkoutButtonLabel = isCurrentChange ? 'Checked out' : 'Check out change';
  const bookmarkNameSchema = useMemo(() => z.string().trim().min(1, 'Bookmark name is required'), []);
  const syntheticBookmarkNames = useMemo(() => new Set(['@', 'git_head()']), []);

  useEffect(() => {
    if (!selectedCommit) {
      setIsEditingDescription(false);
      setDescriptionDraft('');
      return;
    }

    if (!isEditingDescription) {
      const nextDraft = selectedCommit.description === '(no description)'
        ? ''
        : selectedCommit.description;
      setDescriptionDraft(nextDraft);
    }
  }, [selectedCommit, isEditingDescription]);

  useEffect(() => {
    setNewBookmarkName('');
    setBookmarkError(null);
  }, [selectedCommitId]);

  useEffect(() => {
    setActiveView('details');
  }, [selectedCommitId]);

  const handleViewSelect = (nextView: SidebarView) => {
    setActiveView(nextView);
  };

  const normalizedDraftDescription = descriptionDraft.trim();
  const normalizedCurrentDescription = (selectedCommit?.description ?? '').trim();
  const hasDescriptionChanges = normalizedDraftDescription !== normalizedCurrentDescription;

  const handleStartEditingDescription = () => {
    if (!selectedCommit) return;
    setIsEditingDescription(true);
  };

  const handleCancelEditingDescription = () => {
    if (selectedCommit) {
      const nextDraft = selectedCommit.description === '(no description)'
        ? ''
        : selectedCommit.description;
      setDescriptionDraft(nextDraft);
    } else {
      setDescriptionDraft('');
    }
    setIsEditingDescription(false);
  };

  const handleSaveDescription = async () => {
    if (!selectedCommitId) return;

    if (!hasDescriptionChanges) {
      setIsEditingDescription(false);
      return;
    }

    await updateChangeDescription(selectedCommitId, descriptionDraft);
    setIsEditingDescription(false);
  };

  const isSaveDisabled = !hasDescriptionChanges || isExecutingCommand;

  const handleAddBookmark = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCommitId) {
      return;
    }

    const rawName = newBookmarkName;

    try {
      const validatedString = bookmarkNameSchema.parse(rawName);
      const validatedName = createBookmarkName(validatedString);

      if (syntheticBookmarkNames.has(validatedString)) {
        setBookmarkError('This bookmark name is reserved.');
        return;
      }

      const alreadyExists = selectedCommitBookmarks.some(bookmark => String(bookmark) === validatedString);
      if (alreadyExists) {
        setBookmarkError('Bookmark already exists on this change.');
        return;
      }

      setBookmarkError(null);
      await addBookmark(validatedName, selectedCommitId);
      setNewBookmarkName('');
    } catch (error) {
      if (error instanceof z.ZodError) {
        const firstIssue = error.issues[0];
        setBookmarkError(firstIssue?.message ?? 'Invalid bookmark name.');
        return;
      }
      throw error;
    }
  };

  const handleSummarizeAll = async () => {
    if (!selectedCommitId || fileChanges.kind !== 'success') return;
    
    setLoadingSummaries(true);
    setSummaryError(null);
    const newSummaries: Record<string, string> = {};

    try {
      // Get diffs for all files and summarize them
      for (const fileChange of fileChanges.data) {
        try {
          // Fetch the diff for this file using tRPC client
          const diff = await trpc.fileDiff.query({ 
            repoPath,
            commitId: selectedCommitId, 
            filePath: fileChange.path 
          });

          // Summarize with LLM (direct OpenAI call from frontend)
          const summary = await llmService.summarizeDiff(fileChange.path, diff);
          newSummaries[fileChange.path] = summary;
        } catch (error) {
          console.error(`Failed to summarize ${fileChange.path}:`, error);
          newSummaries[fileChange.path] = `Error: ${error instanceof Error ? error.message : 'Failed to generate summary'}`;
        }
      }
      setSummaries(newSummaries);
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : 'Failed to generate summaries');
    } finally {
      setLoadingSummaries(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'M': return '📝'; // Modified
      case 'A': return '➕'; // Added
      case 'D': return '❌'; // Deleted
      case 'R': return '🔄'; // Renamed
      case 'C': return '📋'; // Copied
      default: return '❓';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'M': return '#f59e0b'; // amber
      case 'A': return '#10b981'; // emerald
      case 'D': return '#ef4444'; // red
      case 'R': return '#8b5cf6'; // violet
      case 'C': return '#06b6d4'; // cyan
      default: return '#6b7280'; // gray
    }
  };

  if (!selectedCommitId) {
    return (
      <div style={{
        width: '250px',
        minWidth: '250px',
        borderLeft: '1px solid #e5e7eb',
        background: '#f9fafb',
        padding: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#6b7280',
        fontSize: '14px',
      }}>
        Select a commit to view modified files
      </div>
    );
  }

  const previewBanner = evologPreviewCommitId ? (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      padding: '8px 10px',
      borderRadius: '4px',
      border: '1px solid #fde68a',
      background: '#fef3c7',
      color: '#78350f',
      fontSize: '12px',
      marginBottom: '12px',
    }}>
      <span>
        Viewing evolution entry {evologPreviewCommitId.slice(0, 8)}
      </span>
      <button
        type="button"
        onClick={() => onEvologPreviewSelect?.(undefined)}
        style={{
          padding: '4px 8px',
          borderRadius: '4px',
          border: '1px solid #d97706',
          background: '#fcd34d',
          color: '#92400e',
          cursor: 'pointer',
          fontSize: '11px',
          fontWeight: 500,
        }}
      >
        Back to latest
      </button>
    </div>
  ) : null;

  return (
    <div style={{
      width: '250px',
      minWidth: '250px',
      borderLeft: '1px solid #e5e7eb',
      background: '#f9fafb',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '16px',
      }}>
        {sidebarViews.map((view) => {
          const isActive = activeView === view;
          return (
            <button
              key={view}
              type="button"
              onClick={() => handleViewSelect(view)}
              aria-pressed={isActive}
              style={{
                padding: '6px 12px',
                borderRadius: '4px',
                border: isActive ? '1px solid #2563eb' : '1px solid #d1d5db',
                background: isActive ? '#2563eb' : '#ffffff',
                color: isActive ? '#ffffff' : '#374151',
                cursor: isActive ? 'default' : 'pointer',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              {sidebarViewLabels[view]}
            </button>
          );
        })}
      </div>

      {activeView === 'details' && (
        <>
          <h3 style={{ 
            margin: '0 0 10px 0', 
            fontSize: '14px', 
            color: '#111827',
            borderBottom: '1px solid #e5e7eb',
            paddingBottom: '6px',
          }}>
            📁 Modified Files
          </h3>
          
          {activeCommitId && (
            <div style={{ 
              fontSize: '11px', 
              color: '#6b7280', 
              marginBottom: '10px',
              fontFamily: 'monospace',
            }}>
              Viewing commit {activeCommitId.slice(0, 8)}
              {selectedCommitId && activeCommitId !== selectedCommitId && (
                <span style={{ marginLeft: '6px', color: '#f97316' }}>
                  (evolog preview)
                </span>
              )}
            </div>
          )}
          
          {previewBanner}
      
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        marginBottom: '16px',
      }}>
        <label style={{
          fontSize: '12px',
          color: '#6b7280',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          Description
        </label>
        {isEditingDescription ? (
          <>
            <textarea
              value={descriptionDraft}
              onChange={(event) => setDescriptionDraft(event.target.value)}
              rows={3}
              autoFocus
              disabled={isExecutingCommand}
              placeholder="Describe this change..."
              style={{
                resize: 'vertical',
                minHeight: '60px',
                padding: '8px 10px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '13px',
                lineHeight: '1.4',
                fontFamily: 'inherit',
                color: '#111827',
                background: '#ffffff',
              }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleSaveDescription}
                disabled={isSaveDisabled}
                style={{
                  padding: '6px 12px',
                  borderRadius: '4px',
                  border: '1px solid #2563eb',
                  background: isSaveDisabled ? '#bfdbfe' : '#2563eb',
                  color: '#ffffff',
                  cursor: isSaveDisabled ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: 500,
                }}
              >
                Save
              </button>
              <button
                onClick={handleCancelEditingDescription}
                disabled={isExecutingCommand}
                style={{
                  padding: '6px 12px',
                  borderRadius: '4px',
                  border: '1px solid #d1d5db',
                  background: '#ffffff',
                  color: '#374151',
                  cursor: isExecutingCommand ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: 500,
                }}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{
              padding: '8px 10px',
              borderRadius: '4px',
              border: '1px solid #e5e7eb',
              background: '#ffffff',
              fontSize: '13px',
              lineHeight: '1.4',
              color: '#111827',
              whiteSpace: 'pre-wrap',
              minHeight: '48px',
            }}>
              {selectedCommit ? selectedCommit.description : ''}
            </div>
            <button
              onClick={handleStartEditingDescription}
              disabled={!selectedCommit || isExecutingCommand}
              style={{
                alignSelf: 'flex-start',
                padding: '6px 12px',
                borderRadius: '4px',
                border: '1px solid #d1d5db',
                background: (!selectedCommit || isExecutingCommand) ? '#f3f4f6' : '#ffffff',
                color: '#374151',
                cursor: (!selectedCommit || isExecutingCommand) ? 'not-allowed' : 'pointer',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              Edit description
            </button>
          </>
        )}
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        marginBottom: '16px',
      }}>
        <label style={{
          fontSize: '12px',
          color: '#6b7280',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          Actions
        </label>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
        }}>
          <button
            onClick={() => {
              if (!selectedCommitId || checkoutDisabled) {
                return;
              }
              void checkoutChange(selectedCommitId);
            }}
            disabled={checkoutDisabled}
            style={{
              padding: '6px 12px',
              borderRadius: '4px',
              border: '1px solid #2563eb',
              background: checkoutDisabled ? '#e5e7eb' : '#2563eb',
              color: checkoutDisabled ? '#9ca3af' : '#ffffff',
              cursor: checkoutDisabled ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              fontWeight: 500,
            }}
            title={isCurrentChange
              ? 'This change is already checked out'
              : 'Check out this change into the workspace'}
          >
            {checkoutButtonLabel}
          </button>
          <button
            onClick={() => {
              if (!selectedCommitId) {
                return;
              }
              void abandonChange(selectedCommitId);
            }}
            disabled={!selectedCommitId || isExecutingCommand}
            style={{
              padding: '6px 12px',
              borderRadius: '4px',
              border: '1px solid #ef4444',
              background: (!selectedCommitId || isExecutingCommand) ? '#fee2e2' : '#ef4444',
              color: (!selectedCommitId || isExecutingCommand) ? '#9ca3af' : '#ffffff',
              cursor: (!selectedCommitId || isExecutingCommand) ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              fontWeight: 500,
            }}
            title="Abandon this change"
          >
            Abandon change
          </button>
        </div>
      </div>

      <div className={styles.bookmarkSection}>
        <label style={{
          fontSize: '12px',
          color: '#6b7280',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          Bookmarks
        </label>
        {selectedCommitBookmarks.length > 0 ? (
          <div className={styles.bookmarkList}>
            {selectedCommitBookmarks.map((bookmark) => {
              const label = String(bookmark);
              const isSyntheticBookmark = syntheticBookmarkNames.has(label);
              return (
                <span key={label} className={styles.bookmarkBadge}>
                  <span aria-hidden="true">🔖</span>
                  {label}
                  {!isSyntheticBookmark && (
                    <button
                      type="button"
                      className={styles.bookmarkRemoveButton}
                      onClick={() => {
                        void deleteBookmark(bookmark);
                      }}
                      disabled={isExecutingCommand}
                      title={`Remove bookmark ${label}`}
                      aria-label={`Remove bookmark ${label}`}
                    >
                      Remove
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        ) : (
          <div style={{
            fontSize: '12px',
            color: '#6b7280',
          }}>
            No bookmarks on this change yet.
          </div>
        )}
        <form className={styles.bookmarkForm} onSubmit={handleAddBookmark}>
          <input
            type="text"
            value={newBookmarkName}
            onChange={(event) => setNewBookmarkName(event.target.value)}
            placeholder="Add bookmark…"
            disabled={isExecutingCommand}
          />
          <button type="submit" disabled={isExecutingCommand || newBookmarkName.trim() === ''}>
            Add
          </button>
        </form>
        {bookmarkError && (
          <div className={styles.bookmarkError}>
            {bookmarkError}
          </div>
        )}
      </div>

      {fileChanges.kind === 'loading' && viewCommitId && (
        <div style={{ color: '#6b7280', fontSize: '14px' }}>
          Loading files...
        </div>
      )}

      {fileChanges.kind === 'error' && viewCommitId && (
        <div style={{ color: '#ef4444', fontSize: '14px' }}>
          Error loading files: {String(fileChanges.error)}
        </div>
      )}

      {fileChanges.kind === 'success' && viewCommitId && (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '6px',
          overflowY: 'auto',
          maxHeight: 'calc(80vh - 100px)',
        }}>
          {fileChanges.data.length === 0 ? (
            <div style={{ color: '#6b7280', fontSize: '14px' }}>
              No file changes
            </div>
          ) : (
            fileChanges.data.map((fileChange, index) => {
              if (!selectedCommitId || !selectedChangeId) return null;
              return (
              <div
                key={index}
                draggable={!isPreviewingEvologEntry}
                className={styles.fileItem}
                data-selected={selectedFilePath === fileChange.path ? 'true' : 'false'}
                data-dragging={draggingFilePath === fileChange.path ? 'true' : 'false'}
                style={isPreviewingEvologEntry ? { cursor: 'default' } : undefined}
                onClick={() => onFileSelect?.(fileChange.path)}
                onDragStart={(e) => {
                  if (isPreviewingEvologEntry) {
                    e.preventDefault();
                    return;
                  }
                  setDraggingFilePath(fileChange.path);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('application/json', JSON.stringify({
                    source: 'file-change',
                    fileChange,
                    fromChangeId: selectedChangeId,
                    fromCommitId: selectedCommitId
                  }));
                }}
                onDragEnd={() => {
                  setDraggingFilePath(null);
                }}
                onDragEnter={(e) => {
                  if (isPreviewingEvologEntry) {
                    return;
                  }
                  const fc = draggedFileChange(e)
                  if (fc) {
                    e.currentTarget.classList.add('drag-over');
                    e.currentTarget.classList.toggle('same-file', fc.fileChange.path === fileChange.path);
                    e.currentTarget.dataset.dragKind = 'file-change';
                  }
                }}
                onDragLeave={(e) => {
                  if (isPreviewingEvologEntry) {
                    return;
                  }
                  e.currentTarget.classList.remove('drag-over');
                  e.currentTarget.classList.remove('same-file');
                  delete e.currentTarget.dataset.dragKind;
                }}
              >
                <span style={{ fontSize: '14px' }}>
                  {getStatusIcon(fileChange.status)}
                </span>
                <span 
                  style={{ 
                    fontSize: '10px',
                    fontWeight: 'bold',
                    color: getStatusColor(fileChange.status),
                    minWidth: '16px',
                  }}
                >
                  {fileChange.status}
                </span>
                <span
                  style={{
                    color: '#374151',
                    wordBreak: 'break-all',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    flex: 1,
                  }}
                >
                  {fileChange.path}
                </span>
                {getSizeIndicator(fileChange.additions, fileChange.deletions)}
              </div>
              );
            })
          )}
        </div>
      )}

      {/* AI Summaries Section */}
      {selectedCommitId && fileChanges.kind === 'success' && fileChanges.data.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '8px',
          }}>
            <h3 style={{ 
              margin: 0, 
              fontSize: '14px', 
              color: '#111827',
            }}>
              🤖 AI Summaries
            </h3>
            <button
              onClick={handleSummarizeAll}
              disabled={loadingSummaries}
              style={{
                padding: '4px 12px',
                background: loadingSummaries ? '#d1d5db' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: loadingSummaries ? 'not-allowed' : 'pointer',
                fontSize: '12px',
                fontWeight: '500',
              }}
            >
              {loadingSummaries ? 'Summarizing...' : 'Summarize All'}
            </button>
          </div>

          {summaryError && (
            <div style={{ 
              padding: '8px', 
              background: '#fee2e2', 
              border: '1px solid #ef4444',
              borderRadius: '4px',
              color: '#991b1b',
              fontSize: '12px',
              marginBottom: '8px',
            }}>
              {summaryError}
            </div>
          )}

          {Object.keys(summaries).length > 0 && (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '8px',
              maxHeight: '200px',
              overflowY: 'auto',
            }}>
              {fileChanges.data.map((fileChange) => {
                const summary = summaries[fileChange.path];
                if (!summary) return null;
                
                return (
                  <div 
                    key={fileChange.path}
                    style={{
                      padding: '8px',
                      background: 'white',
                      borderRadius: '4px',
                      border: '1px solid #e5e7eb',
                      fontSize: '11px',
                    }}
                  >
                    <div style={{ 
                      fontFamily: 'monospace',
                      fontWeight: '600',
                      color: '#374151',
                      marginBottom: '4px',
                      fontSize: '10px',
                    }}>
                      {fileChange.path}
                    </div>
                    <div style={{ 
                      color: '#6b7280',
                      lineHeight: '1.4',
                    }}>
                      {summary}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

        </>
      )}

      {activeView === 'evolog' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
        }}>
          <h3 style={{ 
            margin: '0 0 16px 0', 
            fontSize: '16px', 
            color: '#111827',
            borderBottom: '1px solid #e5e7eb',
            paddingBottom: '8px',
          }}>
            🔄 Evolution Log
          </h3>

          {previewBanner}

          {evolog.kind === 'loading' && (
            <div style={{ color: '#6b7280', fontSize: '14px' }}>
              Loading evolution log...
            </div>
          )}

          {evolog.kind === 'error' && (
            <div style={{ color: '#ef4444', fontSize: '14px' }}>
              Error loading evolution log: {String(evolog.error)}
            </div>
          )}

          {evolog.kind === 'success' && (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '8px',
              overflowY: 'auto',
              maxHeight: 'calc(40vh - 60px)',
            }}>
              {evolog.data.length === 0 ? (
                <div style={{ color: '#6b7280', fontSize: '14px' }}>
                  No evolution history
                </div>
              ) : (
                evolog.data.map((entry) => {
                  const isCurrentVersion = entry.commitId === selectedCommitId;
                  const isActiveEntry = activeCommitId === entry.commitId;
                  const isPreviewEntry = Boolean(evologPreviewCommitId) && entry.commitId === evologPreviewCommitId;

                  const handlePreviewSelect = () => {
                    if (!onEvologPreviewSelect) {
                      return;
                    }
                    if (isCurrentVersion || isPreviewEntry) {
                      onEvologPreviewSelect(undefined);
                    } else {
                      onEvologPreviewSelect(entry.commitId);
                    }
                  };

                  const handleSplit = (event: MouseEvent<HTMLButtonElement>) => {
                    event.stopPropagation();
                    if (!selectedCommitId) return;
                    void splitAtEvoLog(selectedCommitId, entry.commitId);
                    onEvologPreviewSelect?.(undefined);
                  };

                  return (
                    <div
                      key={entry.commitId}
                      className={styles.evologEntry}
                      data-active={isActiveEntry ? 'true' : 'false'}
                      onClick={handlePreviewSelect}
                    >
                      <div className={styles.evologEntryHeader}>
                        <span className={styles.evologEntryHash}>
                          {entry.commitId.slice(0, 8)}
                        </span>
                        {isCurrentVersion && (
                          <span className={styles.evologEntryBadge}>
                            current
                          </span>
                        )}
                        {isPreviewEntry && !isCurrentVersion && (
                          <span className={styles.evologEntryBadgePreview}>
                            previewing
                          </span>
                        )}
                      </div>
                      {entry.description && (
                        <div className={styles.evologEntryDescription}>
                          {entry.description}
                        </div>
                      )}
                      <div className={styles.evologEntryOperation}>
                        {entry.operationDescription} ({entry.operationId.slice(0, 8)})
                      </div>
                      <div className={styles.evologEntryFooter}>
                        <span>
                          {isCurrentVersion
                            ? 'Latest version'
                            : isPreviewEntry
                              ? 'Click to return to latest'
                              : 'Click to preview this state'}
                        </span>
                        {!isCurrentVersion && (
                          <button
                            type="button"
                            onClick={handleSplit}
                            disabled={isExecutingCommand}
                            className={styles.evologEntrySplit}
                          >
                            {isExecutingCommand ? 'Splitting…' : 'Split here'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
