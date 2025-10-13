import { trpc, useQuery } from './api'
import './App.css'
import { StackGraphComponent } from './StackGraph';

function App() {
  const stacks = useQuery(trpc.layoutStacks, undefined);
  const graph = useQuery(trpc.graph, undefined);

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

      {/* Content */}
      <div style={{ padding: '20px' }}>
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
          />
        )}
        {(stacks.kind === 'idle' || graph.kind === 'idle') && <p>Idle</p>}
      </div>
    </>
  )
}

export default App
