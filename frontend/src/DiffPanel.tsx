import { queries, useQuery } from './api';
import type { CommitId } from "../../backend/src/repo-parser";

interface DiffPanelProps {
  selectedCommitId?: CommitId;
  selectedFilePath?: string;
}

export function DiffPanel({ selectedCommitId, selectedFilePath }: DiffPanelProps) {
  const fileDiff = useQuery(
    queries.fileDiff, 
    { 
      commitId: selectedCommitId || '', 
      filePath: selectedFilePath || '' 
    },
    {
      enabled: Boolean(selectedCommitId && selectedFilePath)
    }
  );

  if (!selectedCommitId || !selectedFilePath) {
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
        Select a file to view diff
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
      </h3>
      
      <div style={{ 
        fontSize: '11px', 
        color: '#9ca3af', 
        marginBottom: '8px',
        fontFamily: 'monospace',
      }}>
        {selectedCommitId.slice(0, 8)}
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
        <pre style={{ 
          flex: 1,
          overflowY: 'auto',
          overflowX: 'auto',
          background: '#0d1117',
          padding: '12px',
          borderRadius: '4px',
          border: '1px solid #3e3e3e',
          fontSize: '13px',
          fontFamily: 'monospace',
          color: '#e5e7eb',
          margin: 0,
          whiteSpace: 'pre',
          textAlign: 'left',
          lineHeight: '1.4',
        }}>
          {String(fileDiff.data).split('\n').map((line: string, index: number) => {
            let color = '#e5e7eb';
            let backgroundColor = 'transparent';
            
            if (line.startsWith('+') && !line.startsWith('+++')) {
              color = '#22c55e';
              backgroundColor = '#052e16';
            } else if (line.startsWith('-') && !line.startsWith('---')) {
              color = '#ef4444';
              backgroundColor = '#450a0a';
            } else if (line.startsWith('@@')) {
              color = '#3b82f6';
              backgroundColor = '#172554';
            } else if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
              color = '#9ca3af';
            }
            
            return (
              <div 
                key={index}
                style={{ 
                  color,
                  backgroundColor,
                  paddingLeft: '8px',
                  paddingRight: '8px',
                }}
              >
                {line || ' '}
              </div>
            );
          })}
        </pre>
      )}
    </div>
  );
}
