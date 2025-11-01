import { publicProcedure, router } from './trpc.ts';
import {
  getCommitFileChanges,
  getCommitEvolog,
  getFileDiff,
  getCommitStats,
  createCommitId,
  createBookmarkName,
  executeRebase,
  executeSquash,
  executeSplit,
  executeMoveFiles,
  executeUpdateDescription,
  executeAbandon,
  executeCreateEmptyChange,
  executeSplitAtEvolog,
  watchRepoChanges,
  executeCheckout,
  executeUndo,
  executeRedo,
  getOperationLog,
  executeMoveBookmark,
  executeDeleteBookmark,
  executeCreateBookmark,
  executeHunkSplit
} from './repo-parser.ts';
import { z } from 'zod';
import type { GitCommand } from '../../frontend/src/commands.ts';

export const appRouter = router({
  fileChanges: publicProcedure
    .input(z.object({
      repoPath: z.string(),
      commitId: z.string()
    }))
    .query(async ({ input }) => {
        const commitId = createCommitId(input.commitId);
        const fileChanges = await getCommitFileChanges(input.repoPath, commitId);
        return fileChanges;
    }),
  commitStats: publicProcedure
    .input(z.object({
      repoPath: z.string(),
      commitId: z.string()
    }))
    .query(async ({ input }) => {
        const commitId = createCommitId(input.commitId);
        const stats = await getCommitStats(input.repoPath, commitId);
        return stats;
    }),
  evolog: publicProcedure
    .input(z.object({
      repoPath: z.string(),
      commitId: z.string()
    }))
    .query(async ({ input }) => {
        const commitId = createCommitId(input.commitId);
        const evolog = await getCommitEvolog(input.repoPath, commitId);
        return evolog;
    }),
  fileDiff: publicProcedure
    .input(z.object({
      repoPath: z.string(),
      commitId: z.string(),
      filePath: z.string()
    }))
    .query(async ({ input }) => {
        const commitId = createCommitId(input.commitId);
        const diff = await getFileDiff(input.repoPath, commitId, input.filePath);
        return diff;
    }),
  undo: publicProcedure
    .input(z.object({
      repoPath: z.string()
    }))
    .mutation(async ({ input }) => {
        await executeUndo(input.repoPath);
        return { success: true };
    }),
  redo: publicProcedure
    .input(z.object({
      repoPath: z.string()
    }))
    .mutation(async ({ input }) => {
        await executeRedo(input.repoPath);
        return { success: true };
    }),
  operationLog: publicProcedure
    .input(z.object({
      repoPath: z.string()
    }))
    .query(async ({ input }) => {
        const opLog = await getOperationLog(input.repoPath);
        return opLog;
    }),
  executeCommand: publicProcedure
    .input(z.object({
      repoPath: z.string(),
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
            z.object({ type: z.literal('between'), beforeCommitId: z.string(), afterCommitId: z.string() }),
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
            z.object({ type: z.literal('between'), beforeCommitId: z.string(), afterCommitId: z.string() }),
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
            z.object({ type: z.literal('between'), beforeCommitId: z.string(), afterCommitId: z.string() }),
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
          entryCommitId: z.string()
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
            z.object({ type: z.literal('between'), beforeCommitId: z.string(), afterCommitId: z.string() }),
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
          type: z.literal('abandon-change'),
          commitId: z.string()
        }),
        z.object({
          type: z.literal('update-change-description'),
          commitId: z.string(),
          description: z.string()
        }),
        z.object({
          type: z.literal('checkout-change'),
          commitId: z.string()
        }),
        z.object({
          type: z.literal('move-bookmark'),
          bookmarkName: z.string(),
          targetCommitId: z.string()
        }),
        z.object({
          type: z.literal('delete-bookmark'),
          bookmarkName: z.string()
        }),
        z.object({
          type: z.literal('add-bookmark'),
          bookmarkName: z.string(),
          targetCommitId: z.string()
        }),
        z.object({
          type: z.literal('hunk-split'),
          sourceCommitId: z.string(),
          hunkRanges: z.array(z.object({
            filePath: z.string(),
            startLine: z.number(),
            endLine: z.number()
          })),
          target: z.union([
            z.object({ type: z.literal('before'), commitId: z.string() }),
            z.object({ type: z.literal('after'), commitId: z.string() }),
            z.object({ type: z.literal('between'), beforeCommitId: z.string(), afterCommitId: z.string() }),
            z.object({ type: z.literal('new-branch'), fromCommitId: z.string() }),
            z.object({
              type: z.literal('new-commit-between'),
              beforeCommitId: z.string(),
              afterCommitId: z.string()
            }),
            z.object({ type: z.literal('existing-commit'), commitId: z.string() })
          ]),
          description: z.string().optional()
        }),

        // Legacy commands (for backwards compatibility)
        z.object({
          type: z.literal('rebase'),
          commitId: z.string(),
          target: z.union([
            z.object({ type: z.literal('before'), commitId: z.string() }),
            z.object({ type: z.literal('after'), commitId: z.string() }),
            z.object({ type: z.literal('between'), beforeCommitId: z.string(), afterCommitId: z.string() }),
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
            z.object({ type: z.literal('between'), beforeCommitId: z.string(), afterCommitId: z.string() }),
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
        } else if (target.type === 'between') {
          return {
            type: 'between',
            beforeCommitId: createCommitId(target.beforeCommitId),
            afterCommitId: createCommitId(target.afterCommitId)
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
      
      const repoPath = input.repoPath;

      try {
        // Handle intention-based commands
        if (command.type === 'move-file-to-change') {
          // Translate to move-files command
          await executeMoveFiles(
            repoPath,
            createCommitId(command.sourceChangeId),
            createCommitId(command.targetChangeId),
            [command.file]
          );

        } else if (command.type === 'split-file-from-change') {
          // Translate to split command
          const sourceCommitId = createCommitId(command.sourceChangeId);
          const target = parseCommandTarget(command.target);
          await executeSplit(repoPath, sourceCommitId, [command.file], target);

        } else if (command.type === 'rebase-change') {
          // Translate to rebase command
          const changeId = createCommitId(command.changeId);
          const target = parseCommandTarget(command.newParent);
          await executeRebase(repoPath, changeId, target);

        } else if (command.type === 'reorder-change') {
          // Reordering is essentially a rebase to a new position
          const changeId = createCommitId(command.changeId);
          const target = parseCommandTarget(command.newPosition);
          await executeRebase(repoPath, changeId, target);

        } else if (command.type === 'squash-change-into') {
          // Translate to squash command
          await executeSquash(
            repoPath,
            createCommitId(command.sourceChangeId),
            createCommitId(command.targetChangeId)
          );

        } else if (command.type === 'split-at-evolog') {
          const changeId = createCommitId(command.changeId);
          const entryCommitId = createCommitId(command.entryCommitId);

          await executeSplitAtEvolog(repoPath, changeId, entryCommitId);

        } else if (command.type === 'update-change-description') {
          const commitId = createCommitId(command.commitId);
          await executeUpdateDescription(repoPath, commitId, command.description);

        } else if (command.type === 'checkout-change') {
          const commitId = createCommitId(command.commitId);
          await executeCheckout(repoPath, commitId);

        } else if (command.type === 'create-new-change') {
          // Create a new commit with the specified files
          const target = parseCommandTarget(command.parent);

          if (command.files.length > 0) {
            throw new Error('Creating a new change with predefined files is not yet supported');
          }

          await executeCreateEmptyChange(repoPath, target);

        } else if (command.type === 'abandon-change') {
          const commitId = createCommitId(command.commitId);
          await executeAbandon(repoPath, commitId);

        } else if (command.type === 'move-bookmark') {
          const bookmarkName = createBookmarkName(command.bookmarkName);
          const targetCommitId = createCommitId(command.targetCommitId);
          await executeMoveBookmark(repoPath, bookmarkName, targetCommitId);

        } else if (command.type === 'delete-bookmark') {
          const bookmarkName = createBookmarkName(command.bookmarkName);
          await executeDeleteBookmark(repoPath, bookmarkName);

        } else if (command.type === 'add-bookmark') {
          const bookmarkName = createBookmarkName(command.bookmarkName);
          const targetCommitId = createCommitId(command.targetCommitId);
          await executeCreateBookmark(repoPath, bookmarkName, targetCommitId);

        } else if (command.type === 'hunk-split') {
          const sourceCommitId = createCommitId(command.sourceCommitId);
          const target = parseCommandTarget(command.target);
          await executeHunkSplit(repoPath, sourceCommitId, command.hunkRanges, target, command.description);

        } else if (command.type === 'rebase') {
          const commitId = createCommitId(command.commitId);
          const target = parseCommandTarget(command.target);
          await executeRebase(repoPath, commitId, target);

        } else if (command.type === 'squash') {
          const sourceCommitId = createCommitId(command.sourceCommitId);
          const targetCommitId = createCommitId(command.targetCommitId);
          await executeSquash(repoPath, sourceCommitId, targetCommitId);

        } else if (command.type === 'split') {
          const sourceCommitId = createCommitId(command.sourceCommitId);
          const target = parseCommandTarget(command.target);
          await executeSplit(repoPath, sourceCommitId, command.files, target);

        } else if (command.type === 'move-files') {
          const sourceCommitId = createCommitId(command.sourceCommitId);
          const targetCommitId = createCommitId(command.targetCommitId);
          await executeMoveFiles(repoPath, sourceCommitId, targetCommitId, command.files);

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

  // Subscription for repo changes
  watchRepoChanges: publicProcedure
    .input(z.object({
      repoPath: z.string()
    }))
    .subscription(async function* ({ input }) {
        console.log(`🔔 Client subscribed to repo changes: ${input.repoPath}`);
        for await (const repo of watchRepoChanges(input.repoPath)) {
          yield repo;
        }
      
    })
});

// Export type router type signature,
// NOT the router itself.
export type AppRouter = typeof appRouter;
