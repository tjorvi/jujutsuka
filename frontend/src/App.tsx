import './App.css'
import { StackGraphComponent } from './StackGraph';
import { FileListPanel } from './FileListPanel';
import { DiffPanel } from './DiffPanel';
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

  // Reset selected file when commit changes
  const handleCommitSelect = (commitId: CommitId | undefined) => {
    setSelectedCommitId(commitId);
    setSelectedFilePath(undefined);
  };

  return (
    <DragDropProvider>
      {/* Header */}
      <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb' }}>
                <h1 style={{ margin: '0', fontSize: '24px' }}>
          📚 Jujutsu Stacks {isExecutingCommand && <span style={{ color: '#f59e0b', fontSize: '14px' }}>(executing...)</span>}
        </h1>
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
    </DragDropProvider>
  )
}

export default App
