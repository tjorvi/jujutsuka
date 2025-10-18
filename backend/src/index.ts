import { createHTTPServer } from '@trpc/server/adapters/standalone';
import {
  buildCommitGraph,
  buildStackGraph,
  getRepositoryCommits
} from './repo-parser.ts';
import { enhanceStackGraphForLayout } from './layout-utils.ts';
import { appRouter } from './routes.ts';
import process from 'node:process';
import { router } from './trpc.ts';

async function runCli() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'graph':
      case 'commits':
        console.log('Fetching commit graph...');
        const commits = await getRepositoryCommits();
        const graph = buildCommitGraph(commits);
        console.log(JSON.stringify(graph, null, 2));
        break;
      
      case 'stacks':
        console.log('Fetching stack graph...');
        const stackCommits = await getRepositoryCommits();
        const stackGraph = buildStackGraph(stackCommits);
        console.log(JSON.stringify(stackGraph, null, 2));
        break;
      
      case 'layout':
        console.log('Fetching stack graph with layout information...');
        const layoutCommits = await getRepositoryCommits();
        const layoutStackGraph = buildStackGraph(layoutCommits);
        const enhancedLayoutGraph = enhanceStackGraphForLayout(layoutStackGraph);
        console.log(JSON.stringify(enhancedLayoutGraph, null, 2));
        break;
      
      case 'raw':
        console.log('Fetching raw commits...');
        const rawCommits = await getRepositoryCommits();
        console.log(JSON.stringify(rawCommits, null, 2));
        break;
      
      default:
        console.log('Usage: node src/index.ts <command>');
        console.log('Commands:');
        console.log('  graph, commits  - Show commit graph');
        console.log('  stacks         - Show stack graph');
        console.log('  layout         - Show stack graph with layout information (parallel groups)');
        console.log('  raw            - Show raw commits');
        console.log('  (no command)   - Start web server');
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Export type router type signature from routes,
// NOT the router itself.
export type { AppRouter } from './routes.ts';

// Check if running in CLI mode
if (process.argv.length > 2) {
  runCli();
} else {
  // Start web server with SSE support for subscriptions
  console.log('Starting web server on http://localhost:3000');
  const server = createHTTPServer({
    router: appRouter,
    createContext: () => ({}),
    batching: {
      enabled: true,
    },
  });

  server.listen(3000);
  console.log('Server supports SSE subscriptions on http://localhost:3000');

  // Cleanup on shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server...');
    server.close();
  });
}
