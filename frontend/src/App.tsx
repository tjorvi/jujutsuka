import { trpc, useQuery } from './api'
import './App.css'
import { CommitGraph } from './CommitGraph';
import { StackGraphComponent } from './StackGraph';
import { useState } from 'react';

function App() {
  const graph = useQuery(trpc.graph, undefined);
  const stacks = useQuery(trpc.stacks, undefined);
  const [view, setView] = useState<'stacks' | 'commits'>('stacks');

  const isLoading = graph.kind === 'loading' || stacks.kind === 'loading';
  const hasError = graph.kind === 'error' || stacks.kind === 'error';
  const isSuccess = graph.kind === 'success' && stacks.kind === 'success';

  return (
    <>
      {/* View toggle */}
      <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb' }}>
        <h1 style={{ margin: '0 0 16px 0', fontSize: '24px' }}>
          Jujutsu Change Graph
        </h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setView('stacks')}
            style={{
              padding: '8px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              background: view === 'stacks' ? '#3b82f6' : 'white',
              color: view === 'stacks' ? 'white' : '#374151',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            📚 Stack View
          </button>
          <button
            onClick={() => setView('commits')}
            style={{
              padding: '8px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              background: view === 'commits' ? '#3b82f6' : 'white',
              color: view === 'commits' ? 'white' : '#374151',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            🔗 Commit Graph
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '20px' }}>
        {isLoading && <p>Loading...</p>}
        {hasError && (
          <p>Error: {
            graph.kind === 'error' ? String(graph.error) : 
            stacks.kind === 'error' ? String(stacks.error) : 
            'Unknown error'
          }</p>
        )}
        {isSuccess && view === 'stacks' && (
          <StackGraphComponent 
            stackGraph={stacks.data} 
            commitGraph={graph.data}
          />
        )}
        {isSuccess && view === 'commits' && (
          <CommitGraph graph={graph.data} />
        )}
        {(graph.kind === 'idle' || stacks.kind === 'idle') && <p>Idle</p>}
      </div>
    </>
  )
}

export default App
