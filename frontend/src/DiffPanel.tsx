import { useEffect, useState } from 'react';
import { queries, useQuery, trpc } from './api';
import type { CommitId } from "../../backend/src/repo-parser";
import { useGraphStore } from './graphStore';
import { DiffHunk, DiffLine } from './DiffHunk';
import { groupDiffIntoHunks } from './diffParsing';

interface DiffPanelProps {
  commitId?: CommitId;
  selectedFilePath?: string;
  isPreview?: boolean;
}

interface FileDiffData {
  path: string;
  status: string;
  additions?: number;
  deletions?: number;
  diff: string;
  loading: boolean;
  error?: string;
}

// Helper functions
function getStatusIcon(status: string) {
  switch (status) {
    case 'M': return '📝'; // Modified
    case 'A': return '➕'; // Added
    case 'D': return '❌'; // Deleted
    case 'R': return '🔄'; // Renamed
    case 'C': return '📋'; // Copied
    default: return '❓';
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'M': return '#f59e0b'; // amber
    case 'A': return '#10b981'; // emerald
    case 'D': return '#ef4444'; // red
    case 'R': return '#8b5cf6'; // violet
    case 'C': return '#06b6d4'; // cyan
    default: return '#6b7280'; // gray
  }
}

interface DiffContentOptions {
  readonly attachToHeader?: boolean;
}

function renderDiffContent(diff: string, options?: DiffContentOptions) {
  const { metadata, hunks } = groupDiffIntoHunks(diff);
  const attachToHeader = options?.attachToHeader ?? false;

  return (
    <div
      style={{
        background: '#0d1117',
        border: '1px solid #3e3e3e',
        borderTop: attachToHeader ? 'none' : '1px solid #3e3e3e',
        borderRadius: attachToHeader ? '0 0 4px 4px' : '4px',
        paddingTop: '8px',
        paddingBottom: '8px',
        overflowX: 'auto',
      }}
    >
      {metadata.map((line, index) => (
        <DiffLine key={`meta-${index}`} line={line} />
      ))}
      {hunks.map((hunk, index) => (
        <DiffHunk
          key={`${hunk.header}-${index}`}
          header={hunk.header}
          lines={hunk.lines}
          defaultExpanded={index === 0}
        />
      ))}
      {metadata.length === 0 && hunks.length === 0 && (
        <DiffLine line="(No diff content)" />
      )}
    </div>
  );
}

export function DiffPanel({ commitId, selectedFilePath, isPreview }: DiffPanelProps) {
  const repoPath = useGraphStore(state => state.repoPath);
  const [allFileDiffs, setAllFileDiffs] = useState<FileDiffData[]>([]);
  const [loadingAllDiffs, setLoadingAllDiffs] = useState(false);

  // Fetch file changes when showing unified view
  const fileChanges = useQuery(
    queries.fileChanges,
    { repoPath, commitId: commitId || '' },
    { enabled: Boolean(repoPath && commitId && !selectedFilePath) }
  );

  // Fetch single file diff when a specific file is selected
  const fileDiff = useQuery(
    queries.fileDiff,
    {
      repoPath,
      commitId: commitId || '',
      filePath: selectedFilePath || ''
    },
    {
      enabled: Boolean(repoPath && commitId && selectedFilePath)
    }
  );

  // Fetch all diffs when no specific file is selected
  useEffect(() => {
    if (!commitId || selectedFilePath || fileChanges.kind !== 'success') {
      setAllFileDiffs([]);
      return;
    }

    const fetchAllDiffs = async () => {
      setLoadingAllDiffs(true);
      const files = fileChanges.data;

      // Initialize with loading state
      const initialDiffs: FileDiffData[] = files.map(file => ({
        path: file.path,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        diff: '',
        loading: true,
      }));
      setAllFileDiffs(initialDiffs);

      // Fetch all diffs in parallel
      const diffPromises = files.map(async (file, index) => {
        try {
          const diff = await trpc.fileDiff.query({
            repoPath,
            commitId,
            filePath: file.path,
          });
          return { index, diff: String(diff), error: undefined };
        } catch (error) {
          return {
            index,
            diff: '',
            error: error instanceof Error ? error.message : 'Failed to load diff'
          };
        }
      });

      const results = await Promise.all(diffPromises);

      // Update with fetched diffs
      setAllFileDiffs(prev => {
        const updated = [...prev];
        results.forEach(({ index, diff, error }) => {
          updated[index] = {
            ...updated[index],
            diff,
            error,
            loading: false,
          };
        });
        return updated;
      });

      setLoadingAllDiffs(false);
    };

    fetchAllDiffs();
  }, [commitId, selectedFilePath, fileChanges, repoPath]);

  // Unified diff view - show all files when no specific file is selected
  if (!commitId) {
    return (
      <div style={{
        flex: 1,
        borderLeft: '1px solid #e5e7eb',
        background: '#f9fafb',
        padding: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#6b7280',
        fontSize: '14px',
      }}>
        Select a commit to view changes
      </div>
    );
  }

  if (commitId && !selectedFilePath) {
    return (
      <div style={{
        flex: 1,
        borderLeft: '1px solid #e5e7eb',
        background: '#1e1e1e',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <h3 style={{
          margin: '0 0 12px 0',
          fontSize: '14px',
          color: '#e5e7eb',
          borderBottom: '1px solid #3e3e3e',
          paddingBottom: '6px',
        }}>
          📄 All Changes
          {isPreview && (
            <span style={{ marginLeft: '8px', fontSize: '12px', color: '#f97316' }}>
              (evolog preview)
            </span>
          )}
        </h3>

        <div style={{
          fontSize: '11px',
          color: '#9ca3af',
          marginBottom: '8px',
          fontFamily: 'monospace',
        }}>
          {commitId.slice(0, 8)}
        </div>

        {loadingAllDiffs && allFileDiffs.length === 0 && (
          <div style={{ color: '#9ca3af', fontSize: '14px' }}>
            Loading all diffs...
          </div>
        )}

        {fileChanges.kind === 'error' && (
          <div style={{ color: '#ef4444', fontSize: '14px' }}>
            Error loading files: {String(fileChanges.error)}
          </div>
        )}

        {fileChanges.kind === 'success' && fileChanges.data.length === 0 && (
          <div style={{ color: '#9ca3af', fontSize: '14px' }}>
            No file changes in this commit
          </div>
        )}

        {allFileDiffs.length > 0 && (
          <div style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'auto',
          }}>
            {allFileDiffs.map((fileDiff, index) => (
              <div key={fileDiff.path} style={{ marginBottom: index < allFileDiffs.length - 1 ? '24px' : 0 }}>
                {/* File Header */}
                <div style={{
                  background: '#2d3748',
                  padding: '10px 12px',
                  borderRadius: '4px 4px 0 0',
                  borderBottom: '2px solid #4a5568',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                }}>
                  <span style={{ fontSize: '14px' }}>
                    {getStatusIcon(fileDiff.status)}
                  </span>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 'bold',
                    color: getStatusColor(fileDiff.status),
                    minWidth: '16px',
                  }}>
                    {fileDiff.status}
                  </span>
                  <span style={{
                    flex: 1,
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    color: '#e5e7eb',
                    fontWeight: '500',
                  }}>
                    {fileDiff.path}
                  </span>
                  {(fileDiff.additions !== undefined || fileDiff.deletions !== undefined) && (
                    <div style={{
                      display: 'flex',
                      gap: '8px',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                    }}>
                      {fileDiff.additions !== undefined && (
                        <span style={{ color: '#22c55e' }}>+{fileDiff.additions}</span>
                      )}
                      {fileDiff.deletions !== undefined && (
                        <span style={{ color: '#ef4444' }}>-{fileDiff.deletions}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Diff Content */}
                {fileDiff.loading && (
                  <div style={{
                    background: '#0d1117',
                    padding: '12px',
                    borderRadius: '0 0 4px 4px',
                    color: '#9ca3af',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                  }}>
                    Loading diff...
                  </div>
                )}

                {fileDiff.error && (
                  <div style={{
                    background: '#0d1117',
                    padding: '12px',
                    borderRadius: '0 0 4px 4px',
                    color: '#ef4444',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                  }}>
                    Error: {fileDiff.error}
                  </div>
                )}

                {!fileDiff.loading && !fileDiff.error && (
                  renderDiffContent(fileDiff.diff, { attachToHeader: true })
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      flex: 1,
      borderLeft: '1px solid #e5e7eb',
      background: '#1e1e1e',
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <h3 style={{ 
        margin: '0 0 12px 0', 
        fontSize: '14px', 
        color: '#e5e7eb',
        borderBottom: '1px solid #3e3e3e',
        paddingBottom: '6px',
      }}>
        📄 Diff: {selectedFilePath}
        {isPreview && (
          <span style={{ marginLeft: '8px', fontSize: '12px', color: '#f97316' }}>
            (evolog preview)
          </span>
        )}
      </h3>
      
      <div style={{ 
        fontSize: '11px', 
        color: '#9ca3af', 
        marginBottom: '8px',
        fontFamily: 'monospace',
      }}>
        {commitId.slice(0, 8)}
      </div>

      {fileDiff.kind === 'loading' && (
        <div style={{ color: '#9ca3af', fontSize: '14px' }}>
          Loading diff...
        </div>
      )}

      {fileDiff.kind === 'error' && (
        <div style={{ color: '#ef4444', fontSize: '14px' }}>
          Error loading diff: {String(fileDiff.error)}
        </div>
      )}

      {fileDiff.kind === 'success' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {renderDiffContent(String(fileDiff.data))}
        </div>
      )}
    </div>
  );
}
