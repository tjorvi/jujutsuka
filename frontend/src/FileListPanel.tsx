import { queries, useQuery } from './api';
import type { CommitId } from "../../backend/src/repo-parser";

interface FileListPanelProps {
  selectedCommitId?: CommitId;
}

export function FileListPanel({ selectedCommitId }: FileListPanelProps) {
  // Use a placeholder commit ID when none is selected, and handle it in the render
  const fileChanges = useQuery(
    queries.fileChanges, 
    { commitId: selectedCommitId || '' }
  );

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
        width: '300px',
        minWidth: '300px',
        borderLeft: '1px solid #e5e7eb',
        background: '#f9fafb',
        padding: '20px',
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
      width: '300px',
      minWidth: '300px',
      borderLeft: '1px solid #e5e7eb',
      background: '#f9fafb',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <h3 style={{ 
        margin: '0 0 16px 0', 
        fontSize: '16px', 
        color: '#111827',
        borderBottom: '1px solid #e5e7eb',
        paddingBottom: '8px',
      }}>
        📁 Modified Files
      </h3>
      
      <div style={{ 
        fontSize: '12px', 
        color: '#6b7280', 
        marginBottom: '12px',
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
          gap: '8px',
          overflowY: 'auto',
          maxHeight: 'calc(80vh - 120px)',
        }}>
          {fileChanges.data.length === 0 ? (
            <div style={{ color: '#6b7280', fontSize: '14px' }}>
              No file changes
            </div>
          ) : (
            fileChanges.data.map((fileChange, index) => (
              <div 
                key={index}
                style={{
                  padding: '8px 12px',
                  background: 'white',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#9ca3af';
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e5e7eb';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <span style={{ fontSize: '16px' }}>
                  {getStatusIcon(fileChange.status)}
                </span>
                <span 
                  style={{ 
                    fontSize: '11px',
                    fontWeight: 'bold',
                    color: getStatusColor(fileChange.status),
                    minWidth: '20px',
                  }}
                >
                  {fileChange.status}
                </span>
                <span 
                  style={{ 
                    color: '#374151',
                    wordBreak: 'break-all',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                  }}
                >
                  {fileChange.path}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}