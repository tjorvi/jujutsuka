import { publicProcedure, router } from './trpc.ts';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { buildCommitGraph, buildStackGraph, getRepositoryCommits } from './repo-parser.ts';
 
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
});


// Export type router type signature,
// NOT the router itself.
export type AppRouter = typeof appRouter;

const server = createHTTPServer({
  router: appRouter,
});
 
server.listen(3000);
