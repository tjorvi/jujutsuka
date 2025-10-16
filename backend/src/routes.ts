import { publicProcedure, router } from './trpc.ts';
import { 
  buildCommitGraph, 
  buildStackGraph, 
  getRepositoryCommits,
  getCommitFileChanges,
  getCommitEvolog,
  createCommitId,
  executeRebase,
  executeSquash,
  executeSplit,
  executeMoveFiles
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
        }),
        z.object({
          type: z.literal('move-files'),
          sourceCommitId: z.string(),
          targetCommitId: z.string(),
          files: z.array(z.object({
            path: z.string(),
            status: z.string()
          }))
        })
      ])
    }))
    .mutation(async ({ input }) => {
      const command = input.command as GitCommand;
      
      console.log('🚀 Executing command:', command);
      
      try {
        if (command.type === 'rebase') {
          const commitId = createCommitId(command.commitId);
          let target;
          
          if (command.target.type === 'before' || command.target.type === 'after') {
            target = {
              type: command.target.type,
              commitId: createCommitId(command.target.commitId)
            };
          } else if (command.target.type === 'new-branch') {
            target = {
              type: command.target.type,
              fromCommitId: createCommitId(command.target.fromCommitId)
            };
          } else {
            throw new Error(`Unsupported rebase target type: ${command.target.type}`);
          }
          
          await executeRebase(commitId, target);
          
        } else if (command.type === 'squash') {
          const sourceCommitId = createCommitId(command.sourceCommitId);
          const targetCommitId = createCommitId(command.targetCommitId);
          await executeSquash(sourceCommitId, targetCommitId);
          
        } else if (command.type === 'split') {
          const sourceCommitId = createCommitId(command.sourceCommitId);
          let target;
          
          if (command.target.type === 'before' || command.target.type === 'after') {
            target = {
              type: command.target.type,
              commitId: createCommitId(command.target.commitId)
            };
          } else if (command.target.type === 'new-branch') {
            target = {
              type: command.target.type,
              fromCommitId: createCommitId(command.target.fromCommitId)
            };
          } else if (command.target.type === 'new-commit-between') {
            target = {
              type: command.target.type,
              beforeCommitId: createCommitId(command.target.beforeCommitId),
              afterCommitId: createCommitId(command.target.afterCommitId)
            };
          } else if (command.target.type === 'existing-commit') {
            target = {
              type: command.target.type,
              commitId: createCommitId(command.target.commitId)
            };
          } else {
            throw new Error(`Unsupported split target type: ${command.target.type}`);
          }
          
          await executeSplit(sourceCommitId, command.files, target);
          
        } else if (command.type === 'move-files') {
          const sourceCommitId = createCommitId(command.sourceCommitId);
          const targetCommitId = createCommitId(command.targetCommitId);
          await executeMoveFiles(sourceCommitId, targetCommitId, command.files);
          
        } else {
          throw new Error(`Unknown command type: ${(command as any).type}`);
        }
        
        console.log('✅ Command executed successfully');
        return { success: true, message: `Command ${command.type} executed successfully` };
        
      } catch (error) {
        console.error('❌ Command execution failed:', error);
        throw new Error(`Failed to execute ${command.type} command: ${error instanceof Error ? error.message : String(error)}`);
      }
    }),
});

// Export type router type signature,
// NOT the router itself.
export type AppRouter = typeof appRouter;