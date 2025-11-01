import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { ChangeId, CommitId, FileChange, Commit, OpLogEntry, Bookmark, BookmarkName } from "../../backend/src/repo-parser";
import type { GitCommand, CommandTarget, IntentionCommand, HunkRange } from './commands';
import { mutations } from './api';

type CommitGraph = Record<CommitId, { commit: Commit; children: CommitId[] }>;

declare const UiOperationIdBrand: unique symbol;
export type UiOperationId = string & { readonly [UiOperationIdBrand]: true };

export type UiOperationStatus = 'triggered' | 'succeeded' | 'failed';

export type UiOperationKind =
  | { readonly type: 'intention-command'; readonly command: IntentionCommand }
  | { readonly type: 'legacy-command'; readonly command: GitCommand }
  | { readonly type: 'button'; readonly button: 'undo' | 'redo' | 'other' };

export interface UiOperationLogEntry {
  readonly id: UiOperationId;
  readonly timestamp: string;
  readonly description: string;
  readonly kind: UiOperationKind;
  readonly status: UiOperationStatus;
  readonly opLogHeadAtCreation?: string;
  readonly errorMessage?: string;
}

interface UiOperationDraft {
  readonly description: string;
  readonly kind: UiOperationKind;
}

const UI_OPERATION_LOG_LIMIT = 200;

let uiOperationCounter = 0;

function createUiOperationId(): UiOperationId {
  uiOperationCounter += 1;
  return `ui-${uiOperationCounter}` as UiOperationId;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(value)}`);
}

function shortId(id: string): string {
  return id.length <= 8 ? id : id.slice(0, 8);
}

function summariseCommandTarget(target: CommandTarget): string {
  switch (target.type) {
    case 'before':
      return `before ${shortId(target.commitId)}`;
    case 'after':
      return `after ${shortId(target.commitId)}`;
    case 'between':
      return `between ${shortId(target.beforeCommitId)} ⇢ ${shortId(target.afterCommitId)}`;
    case 'new-branch':
      return `new branch from ${shortId(target.fromCommitId)}`;
    case 'new-commit-between':
      return `new commit between ${shortId(target.beforeCommitId)} ⇢ ${shortId(target.afterCommitId)}`;
    case 'existing-commit':
      return `existing commit ${shortId(target.commitId)}`;
    default:
      return assertNever(target);
  }
}

function describeFileCount(files: readonly FileChange[]): string {
  if (files.length === 0) {
    return 'no files';
  }
  if (files.length === 1) {
    return files[0]?.path ?? '1 file';
  }
  const [first, second] = files;
  if (!first || !second) {
    return `${files.length} files`;
  }
  return `${files.length} files (${first.path}, ${second.path}${files.length > 2 ? ', ...' : ''})`;
}

function describeIntentionCommand(command: IntentionCommand): string {
  switch (command.type) {
    case 'move-file-to-change':
      return `Move ${command.file.path} from ${shortId(command.sourceChangeId)} to ${shortId(command.targetChangeId)}`;
    case 'split-file-from-change':
      return `Split ${command.file.path} from ${shortId(command.sourceChangeId)} to ${summariseCommandTarget(command.target)}`;
    case 'rebase-change':
      return `Rebase ${shortId(command.changeId)} onto ${summariseCommandTarget(command.newParent)}`;
    case 'reorder-change':
      return `Reorder ${shortId(command.changeId)} to ${summariseCommandTarget(command.newPosition)}`;
    case 'squash-change-into':
      return `Squash ${shortId(command.sourceChangeId)} into ${shortId(command.targetChangeId)}`;
    case 'split-at-evolog':
      return `Split ${shortId(command.changeId)} at evolog entry ${shortId(command.entryCommitId)}`;
    case 'create-new-change':
      return `Create change at ${summariseCommandTarget(command.parent)} with ${describeFileCount(command.files)}`;
    case 'update-change-description': {
      const snippet = command.description.trim().replace(/\s+/g, ' ');
      const truncated = snippet.length > 60 ? `${snippet.slice(0, 57)}...` : snippet;
      return `Update description for ${shortId(command.commitId)} to "${truncated}"`;
    }
    case 'abandon-change':
      return `Abandon change ${shortId(command.commitId)}`;
    case 'checkout-change':
      return `Checkout change ${shortId(command.commitId)}`;
    case 'move-bookmark':
      return `Move bookmark ${String(command.bookmarkName)} to ${shortId(command.targetCommitId)}`;
    case 'delete-bookmark':
      return `Delete bookmark ${String(command.bookmarkName)}`;
    case 'add-bookmark':
      return `Add bookmark ${String(command.bookmarkName)} at ${shortId(command.targetCommitId)}`;
    case 'hunk-split': {
      const count = command.hunkRanges.length;
      return `Split ${count} hunk${count === 1 ? '' : 's'} from ${shortId(command.sourceCommitId)} to ${summariseCommandTarget(command.target)}`;
    }
    default:
      return assertNever(command);
  }
}

function describeLegacyGitCommand(command: GitCommand): string {
  switch (command.type) {
    case 'rebase':
      return `Legacy rebase ${shortId(command.commitId)} onto ${summariseCommandTarget(command.target)}`;
    case 'squash':
      return `Legacy squash ${shortId(command.sourceCommitId)} into ${shortId(command.targetCommitId)}`;
    case 'split':
      return `Legacy split ${shortId(command.sourceCommitId)} via ${summariseCommandTarget(command.target)} with ${describeFileCount(command.files)}`;
    case 'move-files':
      return `Legacy move ${describeFileCount(command.files)} from ${shortId(command.sourceCommitId)} to ${shortId(command.targetCommitId)}`;
    default:
      return describeIntentionCommand(command as IntentionCommand);
  }
}

interface GraphState {
  // Data
  commitGraph: CommitGraph | null;
  currentCommitId: CommitId | null;
  operationLog: OpLogEntry[] | null;
  uiOperationLog: readonly UiOperationLogEntry[];
  isExecutingCommand: boolean; // Loading state for command execution
  repoPath: string;
  divergentChangeIds: ReadonlySet<ChangeId>;
  bookmarksByCommit: Record<CommitId, readonly BookmarkName[]>;

  // Core actions
  setCommitGraph: (commitGraph: CommitGraph) => void;
  setCurrentCommitId: (commitId: CommitId | null) => void;
  setOperationLog: (operationLog: OpLogEntry[]) => void;
  logUiOperation: (draft: UiOperationDraft) => UiOperationId;
  updateUiOperationStatus: (operationId: UiOperationId, status: UiOperationStatus, errorMessage?: string) => void;
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
      uiOperationLog: [],
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

      logUiOperation: (draft) => {
        const { operationLog } = get();
        const id = createUiOperationId();
        const timestamp = new Date().toISOString();
        const opLogHeadAtCreation = operationLog?.[0]?.fullOperationId;
        const entry: UiOperationLogEntry = {
          id,
          timestamp,
          description: draft.description,
          kind: draft.kind,
          status: 'triggered',
          opLogHeadAtCreation,
        };

        set((state) => {
          const existing = state.uiOperationLog;
          const trimmed =
            existing.length >= UI_OPERATION_LOG_LIMIT
              ? existing.slice(existing.length - (UI_OPERATION_LOG_LIMIT - 1))
              : existing;
          return {
            uiOperationLog: [...trimmed, entry],
          };
        });

        return id;
      },

      updateUiOperationStatus: (operationId, status, errorMessage) => {
        set((state) => {
          const index = state.uiOperationLog.findIndex((entry) => entry.id === operationId);
          if (index === -1) {
            return state;
          }
          const existing = state.uiOperationLog[index];
          const updated: UiOperationLogEntry = {
            ...existing,
            status,
            errorMessage,
          };

          return {
            uiOperationLog: [
              ...state.uiOperationLog.slice(0, index),
              updated,
              ...state.uiOperationLog.slice(index + 1),
            ],
          };
        });
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
        const operationId = get().logUiOperation({
          description: describeIntentionCommand(command),
          kind: { type: 'intention-command', command },
        });
        set({ isExecutingCommand: true });

        try {
          await mutations.executeCommand.mutate({ repoPath, command });
          console.log('✅ Intention command executed successfully');
          get().updateUiOperationStatus(operationId, 'succeeded');
        } catch (error) {
          console.error('❌ Intention command execution failed:', error);
          const message = error instanceof Error ? error.message : String(error);
          get().updateUiOperationStatus(operationId, 'failed', message);
          throw error;
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
        const operationId = get().logUiOperation({
          description: describeLegacyGitCommand(command),
          kind: { type: 'legacy-command', command },
        });

        set({ isExecutingCommand: true });

        try {
          await mutations.executeCommand.mutate({ repoPath, command });
          console.log('✅ Rebase command executed successfully');
          get().updateUiOperationStatus(operationId, 'succeeded');
        } catch (error) {
          console.error('❌ Rebase command execution failed:', error);
          const message = error instanceof Error ? error.message : String(error);
          get().updateUiOperationStatus(operationId, 'failed', message);
          throw error;
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
        const operationId = get().logUiOperation({
          description: describeLegacyGitCommand(command),
          kind: { type: 'legacy-command', command },
        });

        set({ isExecutingCommand: true });

        try {
          await mutations.executeCommand.mutate({ repoPath, command });
          console.log('✅ Squash command executed successfully');
          get().updateUiOperationStatus(operationId, 'succeeded');
        } catch (error) {
          console.error('❌ Squash command execution failed:', error);
          const message = error instanceof Error ? error.message : String(error);
          get().updateUiOperationStatus(operationId, 'failed', message);
          throw error;
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
        const operationId = get().logUiOperation({
          description: describeLegacyGitCommand(command),
          kind: { type: 'legacy-command', command },
        });

        set({ isExecutingCommand: true });

        try {
          await mutations.executeCommand.mutate({ repoPath, command });
          console.log('✅ Split command executed successfully');
          get().updateUiOperationStatus(operationId, 'succeeded');
        } catch (error) {
          console.error('❌ Split command execution failed:', error);
          const message = error instanceof Error ? error.message : String(error);
          get().updateUiOperationStatus(operationId, 'failed', message);
          throw error;
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
        const operationId = get().logUiOperation({
          description: describeLegacyGitCommand(command),
          kind: { type: 'legacy-command', command },
        });

        set({ isExecutingCommand: true });

        try {
          await mutations.executeCommand.mutate({ repoPath, command });
          console.log('✅ Move files command executed successfully');
          get().updateUiOperationStatus(operationId, 'succeeded');
        } catch (error) {
          console.error('❌ Move files command execution failed:', error);
          const message = error instanceof Error ? error.message : String(error);
          get().updateUiOperationStatus(operationId, 'failed', message);
          throw error;
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
