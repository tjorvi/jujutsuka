import { trpc, useQuery } from './api'
import './App.css'

function App() {
  const test = useQuery(trpc.test, undefined);

  return (
    <>
    {test.kind === 'loading' && <p>Loading...</p>}
    {test.kind === 'error' && <p>Error: {String(test.error)}</p>}
    {test.kind === 'success' && <p>Success: {test.data}</p>}
    {test.kind === 'idle' && <p>Idle</p>}
    </>
  )
}

export default App
