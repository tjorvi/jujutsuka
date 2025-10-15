import { publicProcedure, router } from './trpc.ts';
import { 
  buildCommitGraph, 
  buildStackGraph, 
  getRepositoryCommits,
  getCommitFileChanges,
  createCommitId
} from './repo-parser.ts';
import { enhanceStackGraphForLayout } from './layout-utils.ts';
import { z } from 'zod';

export const appRouter = router({
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
  fileChanges: publicProcedure
    .input(z.object({
      commitId: z.string()
    }))
    .query(async ({ input }) => {
        const commitId = createCommitId(input.commitId);
        const fileChanges = await getCommitFileChanges(commitId);
        return fileChanges;
    }),
});

// Export type router type signature,
// NOT the router itself.
export type AppRouter = typeof appRouter;