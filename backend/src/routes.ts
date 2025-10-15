import { publicProcedure, router } from './trpc.ts';
import { 
  buildCommitGraph, 
  buildStackGraph, 
  getRepositoryCommits,
  getCommitFileChanges,
  getCommitEvolog,
  createCommitId
} from './repo-parser.ts';
import { enhanceStackGraphForLayout } from './layout-utils.ts';
import { z } from 'zod';
import type { GitCommand } from '../../frontend/src/commands.ts';

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
  evolog: publicProcedure
    .input(z.object({
      commitId: z.string()
    }))
    .query(async ({ input }) => {
        const commitId = createCommitId(input.commitId);
        const evolog = await getCommitEvolog(commitId);
        return evolog;
    }),
  executeCommand: publicProcedure
    .input(z.object({
      command: z.union([
        z.object({
          type: z.literal('rebase'),
          commitId: z.string(),
          target: z.union([
            z.object({ type: z.literal('before'), commitId: z.string() }),
            z.object({ type: z.literal('after'), commitId: z.string() }),
            z.object({ type: z.literal('new-branch'), fromCommitId: z.string() }),
            z.object({ 
              type: z.literal('new-commit-between'), 
              beforeCommitId: z.string(), 
              afterCommitId: z.string() 
            }),
            z.object({ type: z.literal('existing-commit'), commitId: z.string() })
          ])
        }),
        z.object({
          type: z.literal('squash'),
          sourceCommitId: z.string(),
          targetCommitId: z.string()
        }),
        z.object({
          type: z.literal('split'),
          sourceCommitId: z.string(),
          files: z.array(z.object({
            path: z.string(),
            status: z.string()
          })),
          target: z.union([
            z.object({ type: z.literal('before'), commitId: z.string() }),
            z.object({ type: z.literal('after'), commitId: z.string() }),
            z.object({ type: z.literal('new-branch'), fromCommitId: z.string() }),
            z.object({ 
              type: z.literal('new-commit-between'), 
              beforeCommitId: z.string(), 
              afterCommitId: z.string() 
            }),
            z.object({ type: z.literal('existing-commit'), commitId: z.string() })
          ])
        })
      ])
    }))
    .mutation(async ({ input }) => {
      const command = input.command as GitCommand;
      
      // For now, just log the command - in the future this would execute jj commands
      console.log('🚀 Executing command:', command);
      
      // Simulate command execution delay
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return { success: true, message: `Command ${command.type} executed successfully` };
    }),
});

// Export type router type signature,
// NOT the router itself.
export type AppRouter = typeof appRouter;