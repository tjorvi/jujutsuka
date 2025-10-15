import { queries, useQuery } from './api'
import './App.css'
import { StackGraphComponent } from './StackGraph';
import { FileListPanel } from './FileListPanel';
import { useState } from 'react';
import type { CommitId } from "../../backend/src/repo-parser";

function App() {
  const stacks = useQuery(queries.layoutStacks, undefined);
  const graph = useQuery(queries.graph, undefined);
  const [selectedCommitId, setSelectedCommitId] = useState<CommitId | undefined>();

  const isLoading = stacks.kind === 'loading' || graph.kind === 'loading';
  const hasError = stacks.kind === 'error' || graph.kind === 'error';
  const isSuccess = stacks.kind === 'success' && graph.kind === 'success';

  return (
    <>
      {/* Header */}
      <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb' }}>
        <h1 style={{ margin: '0', fontSize: '24px' }}>
          📚 Jujutsu Stacks
        </h1>
      </div>

      {/* Content - horizontal layout */}
      <div style={{ display: 'flex', height: 'calc(100vh - 80px)' }}>
        {/* Main content area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {isLoading && <p>Loading...</p>}
          {hasError && (
            <p>Error: {
              stacks.kind === 'error' ? String(stacks.error) : 
              graph.kind === 'error' ? String(graph.error) : 
              'Unknown error'
            }</p>
          )}
          {isSuccess && (
            <StackGraphComponent 
              stackGraph={stacks.data} 
              commitGraph={graph.data}
              selectedCommitId={selectedCommitId}
              onCommitSelect={setSelectedCommitId}
            />
          )}
          {(stacks.kind === 'idle' || graph.kind === 'idle') && <p>Idle</p>}
        </div>

        {/* File list panel */}
        <FileListPanel selectedCommitId={selectedCommitId} />
      </div>
    </>
  )
}

export default App
