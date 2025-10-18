import { useState } from 'react';
import { queries, useQuery, trpc } from './api';
import type { CommitId } from "../../backend/src/repo-parser";
import { useDragDrop } from './useDragDrop';
import { llmService } from './llmService';
import { useGraphStore } from './graphStore';

interface FileListPanelProps {
  selectedCommitId?: CommitId;
  onFileSelect?: (filePath: string) => void;
  selectedFilePath?: string;
}

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

export function FileListPanel({ selectedCommitId, onFileSelect, selectedFilePath }: FileListPanelProps) {
  const { draggedFile, setDraggedFile, setDraggedFromCommit } = useDragDrop();
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [loadingSummaries, setLoadingSummaries] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const repoPath = useGraphStore(state => state.repoPath);

  // Use a placeholder commit ID when none is selected, and handle it in the render
  const fileChanges = useQuery(
    queries.fileChanges,
    { repoPath, commitId: selectedCommitId || '' },
    { enabled: !!repoPath && !!selectedCommitId }
  );

  const evolog = useQuery(
    queries.evolog,
    { repoPath, commitId: selectedCommitId || '' },
    { enabled: !!repoPath && !!selectedCommitId }
  );

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
      <h3 style={{ 
        margin: '0 0 10px 0', 
        fontSize: '14px', 
        color: '#111827',
        borderBottom: '1px solid #e5e7eb',
        paddingBottom: '6px',
      }}>
        📁 Modified Files
      </h3>
      
      <div style={{ 
        fontSize: '11px', 
        color: '#6b7280', 
        marginBottom: '10px',
        fontFamily: 'monospace',
      }}>
        {selectedCommitId.slice(0, 8)}
      </div>

      {fileChanges.kind === 'loading' && selectedCommitId && (
        <div style={{ color: '#6b7280', fontSize: '14px' }}>
          Loading files...
        </div>
      )}

      {fileChanges.kind === 'error' && selectedCommitId && (
        <div style={{ color: '#ef4444', fontSize: '14px' }}>
          Error loading files: {String(fileChanges.error)}
        </div>
      )}

      {fileChanges.kind === 'success' && selectedCommitId && (
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
            fileChanges.data.map((fileChange, index) => (
              <div 
                key={index}
                draggable={true}
                onClick={() => onFileSelect?.(fileChange.path)}
                onDragStart={(e) => {
                  setDraggedFile(fileChange);
                  setDraggedFromCommit(selectedCommitId!);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', `${fileChange.path}:${fileChange.status}`);
                }}
                onDragEnd={() => {
                  setDraggedFile(null);
                  setDraggedFromCommit(null);
                }}
                style={{
                  padding: '6px 10px',
                  background: selectedFilePath === fileChange.path ? '#dbeafe' : 'white',
                  borderRadius: '4px',
                  border: selectedFilePath === fileChange.path ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  cursor: draggedFile ? 'grabbing' : 'pointer',
                  transition: 'all 0.2s ease',
                  opacity: draggedFile?.path === fileChange.path ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!draggedFile) {
                    e.currentTarget.style.borderColor = selectedFilePath === fileChange.path ? '#3b82f6' : '#9ca3af';
                    e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!draggedFile) {
                    e.currentTarget.style.borderColor = selectedFilePath === fileChange.path ? '#3b82f6' : '#e5e7eb';
                    e.currentTarget.style.boxShadow = 'none';
                  }
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
            ))
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

      {/* Evolution Log Section */}
      {selectedCommitId && (
        <div style={{ marginTop: '24px' }}>
          <h3 style={{ 
            margin: '0 0 16px 0', 
            fontSize: '16px', 
            color: '#111827',
            borderBottom: '1px solid #e5e7eb',
            paddingBottom: '8px',
          }}>
            🔄 Evolution Log
          </h3>

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
                evolog.data.map((entry, index) => (
                  <div 
                    key={index}
                    style={{
                      padding: '8px 12px',
                      background: 'white',
                      borderRadius: '6px',
                      border: '1px solid #e5e7eb',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                    }}
                  >
                    <div style={{ 
                      fontWeight: 'bold', 
                      color: '#374151', 
                      marginBottom: '4px' 
                    }}>
                      {entry.commitId.slice(0, 8)}
                    </div>
                    {entry.description && (
                      <div style={{ 
                        color: '#6b7280', 
                        marginBottom: '4px',
                        fontSize: '11px'
                      }}>
                        {entry.description}
                      </div>
                    )}
                    <div style={{ 
                      color: '#9ca3af', 
                      fontSize: '10px' 
                    }}>
                      {entry.operationDescription} ({entry.operationId.slice(0, 8)})
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}