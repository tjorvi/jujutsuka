import { publicProcedure, router } from './trpc.ts';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { 
  buildCommitGraph, 
  buildStackGraph, 
  getRepositoryCommits 
} from './repo-parser.ts';
import { enhanceStackGraphForLayout } from './layout-utils.ts';
import process from 'node:process';

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

const appRouter = router({
  graph: publicProcedure
    .query(async () => {
        const commits = await getRepositoryCommits();
        const graph = buildCommitGraph(commits);
        return graph;
    }),
  stacks: publicProcedure
    .query(async () => {
        const commits = await getRepositoryCommits();
        const stackGraph = buildStackGraph(commits);
        return stackGraph;
    }),
  layoutStacks: publicProcedure
    .query(async () => {
        const commits = await getRepositoryCommits();
        const stackGraph = buildStackGraph(commits);
        const enhancedStackGraph = enhanceStackGraphForLayout(stackGraph);
        return enhancedStackGraph;
    }),
});

// Export type router type signature,
// NOT the router itself.
export type AppRouter = typeof appRouter;

// Check if running in CLI mode
if (process.argv.length > 2) {
  runCli();
} else {
  // Start web server
  console.log('Starting web server on http://localhost:3000');
  const server = createHTTPServer({
    router: appRouter,
  });
   
  server.listen(3000);
}
