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
  executeHunkSplit,
  type Position
} from './repo-parser.ts';
import { z } from 'zod';

const fileStatusSchema = z.enum(['M', 'A', 'D', 'R', 'C']);

const commitIdSchema = z.string().transform((val) => createCommitId(val));

const positionSchema = z.union([
  z.object({
    kind: z.literal('before'),
    commit: commitIdSchema,
  }),
  z.object({
    kind: z.literal('after'),
    commit: commitIdSchema,
  }),
  z.object({
    kind: z.literal('between-commits'),
    beforeCommit: commitIdSchema,
    afterCommit: commitIdSchema,
  }),
  z.object({
    kind: z.literal('new-branch'),
    commit: commitIdSchema,
  }),
  z.object({
    kind: z.literal('existing-commit'),
    commit: commitIdSchema,
  }),
]);

// Helper to convert legacy CommandTarget format to Position
function convertLegacyTarget(target: any): Position {
  const type = target.type;
  if (type === 'before' || type === 'after') {
    return { kind: type, commit: createCommitId(target.commitId) };
  } else if (type === 'between' || type === 'new-commit-between') {
    // Both legacy 'between' types become 'between-commits' in the new format
    return {
      kind: 'between-commits',
      beforeCommit: createCommitId(target.beforeCommitId),
      afterCommit: createCommitId(target.afterCommitId),
    };
  } else if (type === 'new-branch') {
    return { kind: 'new-branch', commit: createCommitId(target.fromCommitId) };
  } else if (type === 'existing-commit') {
    return { kind: 'existing-commit', commit: createCommitId(target.commitId) };
  } else {
    throw new Error(`Unsupported legacy target type: ${type}`);
  }
}

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
            status: fileStatusSchema
          }),
          sourceChangeId: z.string(),
          targetChangeId: z.string()
        }),
        z.object({
          type: z.literal('split-file-from-change'),
          file: z.object({
            path: z.string(),
            status: fileStatusSchema
          }),
          sourceChangeId: z.string(),
          position: positionSchema,
          sourceChangeStableId: z.string().optional()
        }),
        z.object({
          type: z.literal('rebase-change'),
          changeId: z.string(),
          changeStableId: z.string().optional(),
          position: positionSchema
        }),
        z.object({
          type: z.literal('reorder-change'),
          changeId: z.string(),
          changeStableId: z.string().optional(),
          position: positionSchema
        }),
        z.object({
          type: z.literal('squash-change-into'),
          sourceChangeId: z.string(),
          targetChangeId: z.string(),
          sourceChangeStableId: z.string().optional(),
          targetChangeStableId: z.string().optional()
        }),
        z.object({
          type: z.literal('split-at-evolog'),
          changeId: z.string(),
          entryCommitId: z.string(),
          changeStableId: z.string().optional(),
          entryChangeStableId: z.string().optional()
        }),
        z.object({
          type: z.literal('create-new-change'),
          files: z.array(z.object({
            path: z.string(),
            status: fileStatusSchema
          })),
          position: positionSchema
        }),
        z.object({
          type: z.literal('abandon-change'),
          commitId: z.string(),
          changeStableId: z.string().optional()
        }),
        z.object({
          type: z.literal('update-change-description'),
          commitId: z.string(),
          description: z.string(),
          changeStableId: z.string().optional()
        }),
        z.object({
          type: z.literal('checkout-change'),
          commitId: z.string(),
          changeStableId: z.string().optional()
        }),
        z.object({
          type: z.literal('move-bookmark'),
          bookmarkName: z.string(),
          targetCommitId: z.string(),
          targetChangeStableId: z.string().optional()
        }),
        z.object({
          type: z.literal('delete-bookmark'),
          bookmarkName: z.string()
        }),
        z.object({
          type: z.literal('add-bookmark'),
          bookmarkName: z.string(),
          targetCommitId: z.string(),
          targetChangeStableId: z.string().optional()
        }),
        z.object({
          type: z.literal('hunk-split'),
          sourceCommitId: z.string(),
          hunkRanges: z.array(z.object({
            filePath: z.string(),
            startLine: z.number(),
            endLine: z.number()
          })),
          position: positionSchema,
          description: z.string().optional(),
          sourceChangeStableId: z.string().optional()
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
          ]),
          changeStableId: z.string().optional()
        }),
        z.object({
          type: z.literal('squash'),
          sourceCommitId: z.string(),
          targetCommitId: z.string(),
          sourceChangeStableId: z.string().optional(),
          targetChangeStableId: z.string().optional()
        }),
        z.object({
          type: z.literal('split'),
          sourceCommitId: z.string(),
          files: z.array(z.object({
            path: z.string(),
            status: fileStatusSchema
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
          sourceChangeStableId: z.string().optional()
        }),
        z.object({
          type: z.literal('move-files'),
          sourceCommitId: z.string(),
          targetCommitId: z.string(),
          files: z.array(z.object({
            path: z.string(),
            status: fileStatusSchema
          })),
          sourceChangeStableId: z.string().optional(),
          targetChangeStableId: z.string().optional()
        })
      ])
    }))
    .mutation(async ({ input }) => {
      const command = input.command;
      
      console.log('🚀 Executing command:', command);
      const repoPath = input.repoPath;
      const opLogBefore = await getOperationLog(repoPath);

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
          // Split file to new commit at position
          const sourceCommitId = createCommitId(command.sourceChangeId);
          const position = command.position;
          await executeSplit(repoPath, sourceCommitId, [command.file], position);

        } else if (command.type === 'rebase-change') {
          // Rebase change to position
          const changeId = createCommitId(command.changeId);
          const position = command.position;
          await executeRebase(repoPath, changeId, position);

        } else if (command.type === 'reorder-change') {
          // Reorder change to new position
          const changeId = createCommitId(command.changeId);
          const position = command.position;
          await executeRebase(repoPath, changeId, position);

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
          // Create a new empty commit at position
          const position = command.position;

          if (command.files.length > 0) {
            throw new Error('Creating a new change with predefined files is not yet supported');
          }

          await executeCreateEmptyChange(repoPath, position);

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
          // Split hunks to new commit at position
          const sourceCommitId = createCommitId(command.sourceCommitId);
          const position = command.position;
          await executeHunkSplit(repoPath, sourceCommitId, command.hunkRanges, position, command.description);

        } else if (command.type === 'rebase') {
          // Legacy rebase command - convert old format to new Position
          const commitId = createCommitId(command.commitId);
          const position = convertLegacyTarget(command.target);
          await executeRebase(repoPath, commitId, position);

        } else if (command.type === 'squash') {
          const sourceCommitId = createCommitId(command.sourceCommitId);
          const targetCommitId = createCommitId(command.targetCommitId);
          await executeSquash(repoPath, sourceCommitId, targetCommitId);

        } else if (command.type === 'split') {
          // Legacy split command - convert old format to new Position
          const sourceCommitId = createCommitId(command.sourceCommitId);
          const position = convertLegacyTarget(command.target);
          await executeSplit(repoPath, sourceCommitId, command.files, position);

        } else if (command.type === 'move-files') {
          const sourceCommitId = createCommitId(command.sourceCommitId);
          const targetCommitId = createCommitId(command.targetCommitId);
          await executeMoveFiles(repoPath, sourceCommitId, targetCommitId, command.files);

        } else {
          // Exhaustive check: this should never happen if all command types are handled
          const _exhaustive: never = command;
          throw new Error(`Unknown command type: ${(_exhaustive as { type: string }).type}`);
        }
        
        console.log('✅ Command executed successfully');
        const opLogAfter = await getOperationLog(repoPath);
        return {
          success: true as const,
          opLogBefore,
          opLogAfter,
        };
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
