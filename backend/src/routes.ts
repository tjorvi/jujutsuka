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
import type { GitCommand, IntentionCommand, LegacyCommand } from '../../frontend/src/commands.ts';

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
        // Intention-based commands
        z.object({
          type: z.literal('move-file-to-change'),
          file: z.object({
            path: z.string(),
            status: z.string()
          }),
          sourceChangeId: z.string(),
          targetChangeId: z.string()
        }),
        z.object({
          type: z.literal('split-file-from-change'),
          file: z.object({
            path: z.string(),
            status: z.string()
          }),
          sourceChangeId: z.string(),
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
          type: z.literal('rebase-change'),
          changeId: z.string(),
          newParent: z.union([
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
          type: z.literal('reorder-change'),
          changeId: z.string(),
          newPosition: z.union([
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
          type: z.literal('squash-change-into'),
          sourceChangeId: z.string(),
          targetChangeId: z.string()
        }),
        z.object({
          type: z.literal('split-at-evolog'),
          changeId: z.string(),
          evoLogIndex: z.number(),
          files: z.array(z.object({
            path: z.string(),
            status: z.string()
          })).optional()
        }),
        z.object({
          type: z.literal('create-new-change'),
          files: z.array(z.object({
            path: z.string(),
            status: z.string()
          })),
          parent: z.union([
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
        
        // Legacy commands (for backwards compatibility)
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
      
      // Helper function to parse command targets
      const parseCommandTarget = (target: any) => {
        if (target.type === 'before' || target.type === 'after') {
          return {
            type: target.type,
            commitId: createCommitId(target.commitId)
          };
        } else if (target.type === 'new-branch') {
          return {
            type: target.type,
            fromCommitId: createCommitId(target.fromCommitId)
          };
        } else if (target.type === 'new-commit-between') {
          return {
            type: target.type,
            beforeCommitId: createCommitId(target.beforeCommitId),
            afterCommitId: createCommitId(target.afterCommitId)
          };
        } else if (target.type === 'existing-commit') {
          return {
            type: target.type,
            commitId: createCommitId(target.commitId)
          };
        } else {
          throw new Error(`Unsupported target type: ${target.type}`);
        }
      };
      
      try {
        // Handle intention-based commands
        if (command.type === 'move-file-to-change') {
          // Translate to move-files command
          await executeMoveFiles(
            createCommitId(command.sourceChangeId), 
            createCommitId(command.targetChangeId), 
            [command.file]
          );
          
        } else if (command.type === 'split-file-from-change') {
          // Translate to split command
          const sourceCommitId = createCommitId(command.sourceChangeId);
          const target = parseCommandTarget(command.target);
          await executeSplit(sourceCommitId, [command.file], target);
          
        } else if (command.type === 'rebase-change') {
          // Translate to rebase command
          const changeId = createCommitId(command.changeId);
          const target = parseCommandTarget(command.newParent);
          await executeRebase(changeId, target);
          
        } else if (command.type === 'reorder-change') {
          // Reordering is essentially a rebase to a new position
          const changeId = createCommitId(command.changeId);
          const target = parseCommandTarget(command.newPosition);
          await executeRebase(changeId, target);
          
        } else if (command.type === 'squash-change-into') {
          // Translate to squash command
          await executeSquash(
            createCommitId(command.sourceChangeId), 
            createCommitId(command.targetChangeId)
          );
          
        } else if (command.type === 'split-at-evolog') {
          // For now, treat evolog split as a regular split
          // TODO: Implement evolog-specific logic when we have evolog integration
          const changeId = createCommitId(command.changeId);
          const files = command.files || [];
          
          // Create a new commit after this one for the split
          const target = {
            type: 'after' as const,
            commitId: changeId
          };
          
          if (files.length > 0) {
            await executeSplit(changeId, files, target);
          } else {
            // If no files specified, we need to get all files from the commit
            // For now, throw an error until we implement file discovery
            throw new Error('Split at evolog requires specific files to be provided');
          }
          
        } else if (command.type === 'create-new-change') {
          // Create a new commit with the specified files
          const target = parseCommandTarget(command.parent);
          
          // For creating a new change, we need a source commit to split from
          // This is a limitation of the current implementation
          throw new Error('Create new change not yet implemented - requires source commit selection');
          
        } else if (command.type === 'rebase') {
          const commitId = createCommitId(command.commitId);
          const target = parseCommandTarget(command.target);
          await executeRebase(commitId, target);
          
        } else if (command.type === 'squash') {
          const sourceCommitId = createCommitId(command.sourceCommitId);
          const targetCommitId = createCommitId(command.targetCommitId);
          await executeSquash(sourceCommitId, targetCommitId);
          
        } else if (command.type === 'split') {
          const sourceCommitId = createCommitId(command.sourceCommitId);
          const target = parseCommandTarget(command.target);
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