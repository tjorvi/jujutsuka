import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { ChangeId, CommitId, FileChange, Commit, OpLogEntry, Bookmark, BookmarkName } from "../../backend/src/repo-parser";
import type { GitCommand, CommandTarget, IntentionCommand, HunkRange } from './commands';
import { mutations } from './api';

type CommitGraph = Record<CommitId, { commit: Commit; children: CommitId[] }>;

interface GraphState {
  // Data
  commitGraph: CommitGraph | null;
  currentCommitId: CommitId | null;
  operationLog: OpLogEntry[] | null;
  isExecutingCommand: boolean; // Loading state for command execution
  repoPath: string;
  divergentChangeIds: ReadonlySet<ChangeId>;
  bookmarksByCommit: Record<CommitId, readonly BookmarkName[]>;

  // Core actions
  setCommitGraph: (commitGraph: CommitGraph) => void;
  setCurrentCommitId: (commitId: CommitId | null) => void;
  setOperationLog: (operationLog: OpLogEntry[]) => void;
  setRepoPath: (repoPath: string) => void;
  setDivergentChangeIds: (changeIds: ReadonlySet<ChangeId>) => void;
  setBookmarks: (bookmarks: readonly Bookmark[] | undefined) => void;
  executeCommand: (command: IntentionCommand) => Promise<void>;

  // Intention-based UI actions
  moveFileToChange: (file: FileChange, sourceChangeId: CommitId, targetChangeId: CommitId) => Promise<void>;
  splitFileFromChange: (file: FileChange, sourceChangeId: CommitId, target: CommandTarget) => Promise<void>;
  rebaseChange: (changeId: CommitId, newParent: CommandTarget) => Promise<void>;
  reorderChange: (changeId: CommitId, newPosition: CommandTarget) => Promise<void>;
  squashChangeInto: (sourceChangeId: CommitId, targetChangeId: CommitId) => Promise<void>;
  splitAtEvoLog: (changeId: CommitId, entryCommitId: CommitId) => Promise<void>;
  createNewChange: (files: FileChange[], parent: CommandTarget) => Promise<void>;
  updateChangeDescription: (commitId: CommitId, description: string) => Promise<void>;
  abandonChange: (commitId: CommitId) => Promise<void>;
  checkoutChange: (commitId: CommitId) => Promise<void>;
  moveBookmark: (bookmarkName: BookmarkName, targetCommitId: CommitId) => Promise<void>;
  deleteBookmark: (bookmarkName: BookmarkName) => Promise<void>;
  addBookmark: (bookmarkName: BookmarkName, targetCommitId: CommitId) => Promise<void>;
  executeHunkSplit: (sourceCommitId: CommitId, hunkRanges: HunkRange[], target: CommandTarget, description?: string) => Promise<void>;

  // Legacy actions (for backwards compatibility)
  executeRebase: (commitId: CommitId, target: CommandTarget) => Promise<void>;
  executeSquash: (sourceCommitId: CommitId, targetCommitId: CommitId) => Promise<void>;
  executeSplit: (sourceCommitId: CommitId, files: FileChange[], target: CommandTarget) => Promise<void>;
  executeMoveFiles: (sourceCommitId: CommitId, targetCommitId: CommitId, files: FileChange[]) => Promise<void>;
}

export const useGraphStore = create<GraphState>()(
  devtools(
    (set, get) => ({
      // Initial state
      commitGraph: null,
      currentCommitId: null,
      operationLog: null,
      isExecutingCommand: false,
      repoPath: '',
      divergentChangeIds: new Set<ChangeId>(),
      bookmarksByCommit: {},

      // Set fresh data from the server
      setCommitGraph: (commitGraph) => {
        set({ commitGraph });
      },

      setCurrentCommitId: (commitId) => {
        set({ currentCommitId: commitId });
      },

      setOperationLog: (operationLog) => {
        set({ operationLog });
      },

      // Set repository path
      setRepoPath: (repoPath) => {
        set({ repoPath });
      },

      setDivergentChangeIds: (changeIds) => {
        set({ divergentChangeIds: new Set(changeIds) });
      },

      setBookmarks: (bookmarks) => {
        if (!bookmarks || bookmarks.length === 0) {
          console.log('🔖 setBookmarks: received none');
          set({ bookmarksByCommit: {} });
          return;
        }

        console.log('🔖 setBookmarks: received', bookmarks.length, 'bookmarks');
        const grouped: Record<string, BookmarkName[]> = Object.create(null);
        for (const bookmark of bookmarks) {
          const commitId = bookmark.commitId as string;
          const existing = grouped[commitId] ?? [];
          grouped[commitId] = [...existing, bookmark.name];
        }

        const sortedEntries = Object.entries(grouped).map(([commitId, names]) => {
          console.log('🔖 setBookmarks: commit', commitId, 'bookmarks', names);
          const sorted = [...names].sort((a, b) => (a as string).localeCompare(b as string)) as BookmarkName[];
          return [commitId, sorted] as const;
        });

        set({ bookmarksByCommit: Object.fromEntries(sortedEntries) as Record<CommitId, readonly BookmarkName[]> });
      },

      // Core command execution
      executeCommand: async (command) => {
        const { repoPath } = get();
        if (!repoPath) {
          console.error('Cannot execute command: no repository path set');
          return;
        }

        console.log('🎯 EXECUTING INTENTION COMMAND:', command);
        set({ isExecutingCommand: true });

        try {
          await mutations.executeCommand.mutate({ repoPath, command });
          console.log('✅ Intention command executed successfully');
        } catch (error) {
          console.error('❌ Intention command execution failed:', error);
        } finally {
          set({ isExecutingCommand: false });
        }
      },

      // Intention-based UI actions
      moveFileToChange: async (file, sourceChangeId, targetChangeId) => {
        const command: IntentionCommand = {
          type: 'move-file-to-change',
          file,
          sourceChangeId,
          targetChangeId,
        };
        await get().executeCommand(command);
      },

      splitFileFromChange: async (file, sourceChangeId, target) => {
        const command: IntentionCommand = {
          type: 'split-file-from-change',
          file,
          sourceChangeId,
          target,
        };
        await get().executeCommand(command);
      },

      rebaseChange: async (changeId, newParent) => {
        const command: IntentionCommand = {
          type: 'rebase-change',
          changeId,
          newParent,
        };
        await get().executeCommand(command);
      },

      reorderChange: async (changeId, newPosition) => {
        const command: IntentionCommand = {
          type: 'reorder-change',
          changeId,
          newPosition,
        };
        await get().executeCommand(command);
      },

      squashChangeInto: async (sourceChangeId, targetChangeId) => {
        const command: IntentionCommand = {
          type: 'squash-change-into',
          sourceChangeId,
          targetChangeId,
        };
        await get().executeCommand(command);
      },

      splitAtEvoLog: async (changeId, entryCommitId) => {
        const command: IntentionCommand = {
          type: 'split-at-evolog',
          changeId,
          entryCommitId,
        };
        await get().executeCommand(command);
      },

      createNewChange: async (files, parent) => {
        const command: IntentionCommand = {
          type: 'create-new-change',
          files,
          parent,
        };
        await get().executeCommand(command);
      },

      updateChangeDescription: async (commitId, description) => {
        const command: IntentionCommand = {
          type: 'update-change-description',
          commitId,
          description,
        };
        await get().executeCommand(command);
      },

      abandonChange: async (commitId) => {
        const command: IntentionCommand = {
          type: 'abandon-change',
          commitId,
        };
        await get().executeCommand(command);
      },

      checkoutChange: async (commitId) => {
        const command: IntentionCommand = {
          type: 'checkout-change',
          commitId,
        };
        await get().executeCommand(command);
      },

      moveBookmark: async (bookmarkName, targetCommitId) => {
        const command: IntentionCommand = {
          type: 'move-bookmark',
          bookmarkName,
          targetCommitId,
        };
        await get().executeCommand(command);
      },

      deleteBookmark: async (bookmarkName) => {
        const command: IntentionCommand = {
          type: 'delete-bookmark',
          bookmarkName,
        };
        await get().executeCommand(command);
      },

      addBookmark: async (bookmarkName, targetCommitId) => {
        const command: IntentionCommand = {
          type: 'add-bookmark',
          bookmarkName,
          targetCommitId,
        };
        await get().executeCommand(command);
      },

      executeHunkSplit: async (sourceCommitId, hunkRanges, target, description) => {
        const command: IntentionCommand = {
          type: 'hunk-split',
          sourceCommitId,
          hunkRanges,
          target,
          description,
        };
        await get().executeCommand(command);
      },

      executeRebase: async (commitId, target) => {
        const { repoPath } = get();
        if (!repoPath) {
          console.error('Cannot execute rebase: no repository path set');
          return;
        }

        const command: GitCommand = { type: 'rebase', commitId, target };
        console.log('🔄 REBASE COMMAND:', command);

        set({ isExecutingCommand: true });

        try {
          await mutations.executeCommand.mutate({ repoPath, command });
          console.log('✅ Rebase command executed successfully');
        } catch (error) {
          console.error('❌ Rebase command execution failed:', error);
        } finally {
          set({ isExecutingCommand: false });
        }
      },

      executeSquash: async (sourceCommitId, targetCommitId) => {
        const { repoPath } = get();
        if (!repoPath) {
          console.error('Cannot execute squash: no repository path set');
          return;
        }

        const command: GitCommand = { type: 'squash', sourceCommitId, targetCommitId };
        console.log('🔧 SQUASH COMMAND:', command);

        set({ isExecutingCommand: true });

        try {
          await mutations.executeCommand.mutate({ repoPath, command });
          console.log('✅ Squash command executed successfully');
        } catch (error) {
          console.error('❌ Squash command execution failed:', error);
        } finally {
          set({ isExecutingCommand: false });
        }
      },

      executeSplit: async (sourceCommitId, files, target) => {
        const { repoPath } = get();
        if (!repoPath) {
          console.error('Cannot execute split: no repository path set');
          return;
        }

        const command: GitCommand = { type: 'split', sourceCommitId, files, target };
        console.log('✂️ SPLIT COMMAND:', command);

        set({ isExecutingCommand: true });

        try {
          await mutations.executeCommand.mutate({ repoPath, command });
          console.log('✅ Split command executed successfully');
        } catch (error) {
          console.error('❌ Split command execution failed:', error);
        } finally {
          set({ isExecutingCommand: false });
        }
      },

      executeMoveFiles: async (sourceCommitId, targetCommitId, files) => {
        const { repoPath } = get();
        if (!repoPath) {
          console.error('Cannot execute move files: no repository path set');
          return;
        }

        const command: GitCommand = { type: 'move-files', sourceCommitId, targetCommitId, files };
        console.log('📁 MOVE FILES COMMAND:', command);

        set({ isExecutingCommand: true });

        try {
          await mutations.executeCommand.mutate({ repoPath, command });
          console.log('✅ Move files command executed successfully');
        } catch (error) {
          console.error('❌ Move files command execution failed:', error);
        } finally {
          set({ isExecutingCommand: false });
        }
      },
    }),
    {
      name: 'graph-store',
    }
  )
);
