import { trpc, useQuery } from './api'
import './App.css'
import { CommitGraph } from './CommitGraph';

function App() {
  const graph = useQuery(trpc.graph, undefined);

  return (
    <>
    {graph.kind === 'loading' && <p>Loading...</p>}
    {graph.kind === 'error' && <p>Error: {String(graph.error)}</p>}
    {graph.kind === 'success' && <CommitGraph graph={graph.data} />}
    {graph.kind === 'idle' && <p>Idle</p>}
    </>
  )
}

export default App
