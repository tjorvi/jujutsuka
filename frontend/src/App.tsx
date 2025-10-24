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
  const [showSettings, setShowSettings] = useState(false);
  const currentCommitId = useGraphStore(state => state.currentCommitId);

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
  };

  useEffect(() => {
    if (!currentCommitId) return;
    setSelectedCommitId(prev => prev ?? currentCommitId);
  }, [currentCommitId]);

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
