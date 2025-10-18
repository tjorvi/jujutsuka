import './App.css'
import { StackGraphComponent } from './StackGraph';
import { FileListPanel } from './FileListPanel';
import { DiffPanel } from './DiffPanel';
import { Settings } from './Settings';
import { DragDropProvider } from './DragDropContext';
import { useState } from 'react';
import type { CommitId } from "../../backend/src/repo-parser";
import { useGraphData } from './useGraphData';

function App() {
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
  const [showSettings, setShowSettings] = useState(false);

  // Reset selected file when commit changes
  const handleCommitSelect = (commitId: CommitId | undefined) => {
    setSelectedCommitId(commitId);
    setSelectedFilePath(undefined);
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
      }}>
        <h1 style={{ margin: '0', fontSize: '24px' }}>
          📚 Jujutsu Stacks {isExecutingCommand && <span style={{ color: '#f59e0b', fontSize: '14px' }}>(executing...)</span>}
        </h1>
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
          }}
        >
          ⚙️ Settings
        </button>
      </div>

      {/* Content - horizontal layout */}
      <div style={{ display: 'flex', height: 'calc(100vh - 80px)' }}>
        {/* Main content area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {isLoading && <p>Loading...</p>}
          {hasError && (
            <p>Error: {String(error)}</p>
          )}
          {isSuccess && stackGraph && commitGraph && (
            <StackGraphComponent 
              stackGraph={stackGraph} 
              commitGraph={commitGraph}
              selectedCommitId={selectedCommitId}
              onCommitSelect={handleCommitSelect}
            />
          )}
        </div>

        {/* File list panel */}
        <FileListPanel 
          selectedCommitId={selectedCommitId} 
          onFileSelect={setSelectedFilePath}
          selectedFilePath={selectedFilePath}
        />

        {/* Diff panel */}
        <DiffPanel 
          selectedCommitId={selectedCommitId}
          selectedFilePath={selectedFilePath}
        />
      </div>

      {/* Settings Modal */}
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </DragDropProvider>
  )
}

export default App
