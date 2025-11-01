import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { ChangeId, CommitId, FileChange, Commit, OpLogEntry, Bookmark, BookmarkName } from "../../backend/src/repo-parser";
import type { GitCommand, CommandTarget, IntentionCommand, HunkRange } from './commands';
import type { DropPosition } from './dropPosition';
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
  readonly completedAt?: string;
  readonly opLogHeadAtCompletion?: string;
  readonly relatedCommitIds: readonly CommitId[];
  readonly relatedChangeIds: readonly ChangeId[];
  readonly relatedCommitAssociations: readonly { commitId: CommitId; changeId?: ChangeId }[];
  readonly opLogEntriesDuring?: readonly OpLogEntry[];
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

interface CommandExecutionResult {
  readonly success: true;
  readonly opLogBefore: OpLogEntry[];
  readonly opLogAfter: OpLogEntry[];
}

function diffOpLogEntries(opLogAfter: readonly OpLogEntry[], opLogBefore: readonly OpLogEntry[]): OpLogEntry[] {
  const beforeIds = new Set(opLogBefore.map(entry => entry.fullOperationId));
  const newEntries: OpLogEntry[] = [];
  for (const entry of opLogAfter) {
    if (beforeIds.has(entry.fullOperationId)) {
      break;
    }
    newEntries.push(entry);
  }
  return newEntries;
}

function addCommitFromPosition(position: DropPosition | null | undefined, addCommit: (id: CommitId) => void) {
  if (!position) {
    return;
  }
  switch (position.kind) {
    case 'before':
    case 'after':
    case 'existing':
      addCommit(position.commit);
      return;
    case 'between':
      addCommit(position.beforeCommit);
      addCommit(position.afterCommit);
      return;
    case 'new-branch':
      addCommit(position.commit);
      return;
    default:
      return;
  }
}

function addCommitFromLegacyTarget(target: CommandTarget | null | undefined, addCommit: (id: CommitId) => void) {
  if (!target) {
    return;
  }
  switch (target.type) {
    case 'before':
    case 'after':
    case 'existing-commit':
      addCommit(target.commitId);
      return;
    case 'between':
    case 'new-commit-between':
      addCommit(target.beforeCommitId);
      addCommit(target.afterCommitId);
      return;
    case 'new-branch':
      addCommit(target.fromCommitId);
      return;
    default:
      return;
  }
}

interface CommitAssociation {
  readonly commitId: CommitId;
  readonly changeId?: ChangeId;
}

interface OperationContext {
  readonly relatedCommitIds: readonly CommitId[];
  readonly relatedChangeIds: readonly ChangeId[];
  readonly relatedCommitAssociations: readonly CommitAssociation[];
}

function deriveOperationContext(
  kind: UiOperationKind,
  commitGraph: CommitGraph | null,
  previousAssociations: readonly CommitAssociation[] = []
): OperationContext {
  const commitSet = new Set<CommitId>();
  const changeSet = new Set<ChangeId>();
  const commitMap = new Map<CommitId, ChangeId | undefined>();

  for (const { commitId, changeId } of previousAssociations) {
    commitMap.set(commitId, changeId);
    commitSet.add(commitId);
    if (changeId) {
      changeSet.add(changeId);
    }
  }

  const registerCommit = (commitId: CommitId | null | undefined, explicitChange?: ChangeId | null) => {
    if (!commitId) return;
    const existing = commitMap.get(commitId);
    const derivedChange = commitGraph?.[commitId]?.commit.changeId as ChangeId | undefined;
    const finalChange = explicitChange ?? existing ?? derivedChange;
    commitMap.set(commitId, finalChange);
    commitSet.add(commitId);
    if (finalChange) {
      changeSet.add(finalChange);
    }
  };

  const addCommit = (id: CommitId | null | undefined, change?: ChangeId | null) => {
    registerCommit(id, change ?? undefined);
  };

  const collectFromCommand = (command: GitCommand | IntentionCommand) => {
    switch (command.type) {
      case 'move-file-to-change':
        addCommit(command.sourceChangeId, command.sourceChangeStableId ?? null);
        addCommit(command.targetChangeId, command.targetChangeStableId ?? null);
        return;
      case 'split-file-from-change':
        addCommit(command.sourceChangeId, command.sourceChangeStableId ?? null);
        addCommitFromPosition(command.position, addCommit);
        return;
      case 'rebase-change':
        addCommit(command.changeId, command.changeStableId ?? null);
        addCommitFromPosition(command.position, addCommit);
        return;
      case 'reorder-change':
        addCommit(command.changeId, command.changeStableId ?? null);
        addCommitFromPosition(command.position, addCommit);
        return;
      case 'squash-change-into':
        addCommit(command.sourceChangeId, command.sourceChangeStableId ?? null);
        addCommit(command.targetChangeId, command.targetChangeStableId ?? null);
        return;
      case 'split-at-evolog':
        addCommit(command.changeId, command.changeStableId ?? null);
        addCommit(command.entryCommitId, command.entryChangeStableId ?? null);
        return;
      case 'create-new-change':
        addCommitFromPosition(command.position, addCommit);
        return;
      case 'update-change-description':
      case 'checkout-change':
      case 'abandon-change':
        addCommit(command.commitId, command.changeStableId ?? null);
        return;
      case 'move-bookmark':
      case 'add-bookmark':
        addCommit(command.targetCommitId, command.targetChangeStableId ?? null);
        return;
      case 'delete-bookmark':
        return;
      case 'hunk-split':
        addCommit(command.sourceCommitId, command.sourceChangeStableId ?? null);
        addCommitFromPosition(command.position, addCommit);
        return;
      case 'move-files':
        addCommit(command.sourceCommitId, command.sourceChangeStableId ?? null);
        addCommit(command.targetCommitId, command.targetChangeStableId ?? null);
        return;
      case 'rebase':
        addCommit(command.commitId, command.changeStableId ?? null);
        addCommitFromLegacyTarget(command.target, addCommit);
        return;
      case 'squash':
        addCommit(command.sourceCommitId, command.sourceChangeStableId ?? null);
        addCommit(command.targetCommitId, command.targetChangeStableId ?? null);
        return;
      case 'split':
        addCommit(command.sourceCommitId, command.sourceChangeStableId ?? null);
        addCommitFromLegacyTarget(command.target, addCommit);
        return;
      default:
        return;
    }
  };

  if (kind.type === 'intention-command') {
    collectFromCommand(kind.command);
  } else if (kind.type === 'legacy-command') {
    collectFromCommand(kind.command);
  }

  const relatedCommitAssociations = Array.from(commitMap.entries()).map(([commitId, changeId]) => ({ commitId, changeId }));

  return {
    relatedCommitIds: Array.from(commitSet),
    relatedChangeIds: Array.from(changeSet),
    relatedCommitAssociations,
  };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(value)}`);
}

function shortId(id: string): string {
  return id.length <= 8 ? id : id.slice(0, 8);
}

function summariseDropPosition(position: DropPosition): string {
  switch (position.kind) {
    case 'before':
      return `before ${shortId(position.commit)}`;
    case 'after':
      return `after ${shortId(position.commit)}`;
    case 'between':
      return `after ${shortId(position.beforeCommit)} and before ${shortId(position.afterCommit)}`;
    case 'new-branch':
      return `new branch from ${shortId(position.commit)}`;
    case 'existing':
      return `existing commit ${shortId(position.commit)}`;
    default:
      return assertNever(position as never);
  }
}

function summariseCommandTarget(target: CommandTarget): string {
  switch (target.type) {
    case 'before':
      return `before ${shortId(target.commitId)}`;
    case 'after':
      return `after ${shortId(target.commitId)}`;
    case 'between':
      return `after ${shortId(target.beforeCommitId)} and before ${shortId(target.afterCommitId)}`;
    case 'new-branch':
      return `new branch from ${shortId(target.fromCommitId)}`;
    case 'new-commit-between':
      return `new commit after ${shortId(target.beforeCommitId)} and before ${shortId(target.afterCommitId)}`;
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
      return `Split ${command.file.path} from ${shortId(command.sourceChangeId)} to ${summariseDropPosition(command.position)}`;
    case 'rebase-change':
      return `Rebase ${shortId(command.changeId)} onto ${summariseDropPosition(command.position)}`;
    case 'reorder-change':
      return `Reorder ${shortId(command.changeId)} to ${summariseDropPosition(command.position)}`;
    case 'squash-change-into':
      return `Squash ${shortId(command.sourceChangeId)} into ${shortId(command.targetChangeId)}`;
    case 'split-at-evolog':
      return `Split ${shortId(command.changeId)} at evolog entry ${shortId(command.entryCommitId)}`;
    case 'create-new-change':
      return `Create change at ${summariseDropPosition(command.position)} with ${describeFileCount(command.files)}`;
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
      return `Split ${count} hunk${count === 1 ? '' : 's'} from ${shortId(command.sourceCommitId)} to ${summariseDropPosition(command.position)}`;
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
  hoveredCommitIds: ReadonlySet<CommitId>;
  hoveredChangeIds: ReadonlySet<ChangeId>;

  // Core actions
  setCommitGraph: (commitGraph: CommitGraph) => void;
  setCurrentCommitId: (commitId: CommitId | null) => void;
  setOperationLog: (operationLog: OpLogEntry[]) => void;
  logUiOperation: (draft: UiOperationDraft) => UiOperationId;
  updateUiOperationStatus: (operationId: UiOperationId, status: UiOperationStatus, updates?: {
    errorMessage?: string;
    completedAt?: string;
    opLogHeadAtCompletion?: string;
    opLogEntriesDuring?: readonly OpLogEntry[];
    relatedCommitIds?: readonly CommitId[];
    relatedChangeIds?: readonly ChangeId[];
    relatedCommitAssociations?: readonly { commitId: CommitId; changeId?: ChangeId }[];
  }) => void;
  setRepoPath: (repoPath: string) => void;
  setDivergentChangeIds: (changeIds: ReadonlySet<ChangeId>) => void;
  setBookmarks: (bookmarks: readonly Bookmark[] | undefined) => void;
  executeCommand: (command: IntentionCommand) => Promise<void>;
  setHoverTargets: (commitIds: Iterable<CommitId>, changeIds: Iterable<ChangeId>) => void;
  clearHoverTargets: () => void;

  // Intention-based UI actions
  moveFileToChange: (file: FileChange, sourceChangeId: CommitId, targetChangeId: CommitId) => Promise<void>;
  splitFileFromChange: (file: FileChange, sourceChangeId: CommitId, position: DropPosition) => Promise<void>;
  rebaseChange: (changeId: CommitId, position: DropPosition) => Promise<void>;
  reorderChange: (changeId: CommitId, position: DropPosition) => Promise<void>;
  squashChangeInto: (sourceChangeId: CommitId, targetChangeId: CommitId) => Promise<void>;
  splitAtEvoLog: (changeId: CommitId, entryCommitId: CommitId) => Promise<void>;
  createNewChange: (files: FileChange[], position: DropPosition) => Promise<void>;
  updateChangeDescription: (commitId: CommitId, description: string) => Promise<void>;
  abandonChange: (commitId: CommitId) => Promise<void>;
  checkoutChange: (commitId: CommitId) => Promise<void>;
  moveBookmark: (bookmarkName: BookmarkName, targetCommitId: CommitId) => Promise<void>;
  deleteBookmark: (bookmarkName: BookmarkName) => Promise<void>;
  addBookmark: (bookmarkName: BookmarkName, targetCommitId: CommitId) => Promise<void>;
  executeHunkSplit: (sourceCommitId: CommitId, hunkRanges: HunkRange[], position: DropPosition, description?: string) => Promise<void>;

  // Legacy actions (for backwards compatibility)
  executeRebase: (commitId: CommitId, target: CommandTarget) => Promise<void>;
  executeSquash: (sourceCommitId: CommitId, targetCommitId: CommitId) => Promise<void>;
  executeSplit: (sourceCommitId: CommitId, files: FileChange[], target: CommandTarget) => Promise<void>;
  executeMoveFiles: (sourceCommitId: CommitId, targetCommitId: CommitId, files: FileChange[]) => Promise<void>;
}

export const useGraphStore = create<GraphState>()(
  devtools(
    (set, get) => {
      const applyCommandOutcome = (response: CommandExecutionResult, operationId: UiOperationId) => {
        const { opLogAfter, opLogBefore } = response;
        const opLogHeadAtCompletion = opLogAfter[0]?.fullOperationId;
        const completedAt = opLogAfter[0]?.timestamp ?? new Date().toISOString();
        const opLogEntriesDuring = diffOpLogEntries(opLogAfter, opLogBefore);
        const entry = get().uiOperationLog.find(item => item.id === operationId);
        const currentCommitGraph = get().commitGraph;
        const context = entry
          ? deriveOperationContext(entry.kind, currentCommitGraph, entry.relatedCommitAssociations)
          : { relatedCommitIds: [] as CommitId[], relatedChangeIds: [] as ChangeId[], relatedCommitAssociations: [] as { commitId: CommitId; changeId?: ChangeId }[] };

        set({ operationLog: opLogAfter });
        get().updateUiOperationStatus(operationId, 'succeeded', {
          opLogHeadAtCompletion,
          completedAt,
          opLogEntriesDuring,
          relatedCommitIds: context.relatedCommitIds,
          relatedChangeIds: context.relatedChangeIds,
          relatedCommitAssociations: context.relatedCommitAssociations,
        });
      };

      return {
      // Initial state
      commitGraph: null,
      currentCommitId: null,
      operationLog: null,
      uiOperationLog: [],
      isExecutingCommand: false,
      repoPath: '',
      divergentChangeIds: new Set<ChangeId>(),
      bookmarksByCommit: {},
      hoveredCommitIds: new Set<CommitId>(),
      hoveredChangeIds: new Set<ChangeId>(),

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
        const { operationLog, commitGraph } = get();
        const context = deriveOperationContext(draft.kind, commitGraph);
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
          relatedCommitIds: context.relatedCommitIds,
          relatedChangeIds: context.relatedChangeIds,
          relatedCommitAssociations: context.relatedCommitAssociations,
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

      updateUiOperationStatus: (operationId, status, updates) => {
        set((state) => {
          const index = state.uiOperationLog.findIndex((entry) => entry.id === operationId);
          if (index === -1) {
            return state;
          }
          const existing = state.uiOperationLog[index];
          const resolvedCompletedAt = status === 'triggered'
            ? existing.completedAt
            : updates?.completedAt ?? existing.completedAt ?? new Date().toISOString();
          const updated: UiOperationLogEntry = {
            ...existing,
            status,
            errorMessage: updates?.errorMessage,
            completedAt: resolvedCompletedAt,
            opLogHeadAtCompletion: updates?.opLogHeadAtCompletion ?? existing.opLogHeadAtCompletion,
            opLogEntriesDuring: updates?.opLogEntriesDuring ?? existing.opLogEntriesDuring,
            relatedCommitIds: updates?.relatedCommitIds ?? existing.relatedCommitIds,
            relatedChangeIds: updates?.relatedChangeIds ?? existing.relatedChangeIds,
            relatedCommitAssociations: updates?.relatedCommitAssociations ?? existing.relatedCommitAssociations,
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

      setHoverTargets: (commitIds, changeIds) => {
        set({
          hoveredCommitIds: new Set(commitIds),
          hoveredChangeIds: new Set(changeIds),
        });
      },

      clearHoverTargets: () => {
        const { hoveredCommitIds, hoveredChangeIds } = get();
        if (hoveredCommitIds.size === 0 && hoveredChangeIds.size === 0) {
          return;
        }
        set({
          hoveredCommitIds: new Set<CommitId>(),
          hoveredChangeIds: new Set<ChangeId>(),
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
          const response = await mutations.executeCommand.mutate({ repoPath, command }) as CommandExecutionResult;
          console.log('✅ Intention command executed successfully');
          applyCommandOutcome(response, operationId);
        } catch (error) {
          console.error('❌ Intention command execution failed:', error);
          const message = error instanceof Error ? error.message : String(error);
          const failureEntry = get().uiOperationLog.find(item => item.id === operationId);
          const failureContext = failureEntry
            ? deriveOperationContext(failureEntry.kind, get().commitGraph, failureEntry.relatedCommitAssociations)
            : { relatedCommitIds: [] as CommitId[], relatedChangeIds: [] as ChangeId[], relatedCommitAssociations: [] as { commitId: CommitId; changeId?: ChangeId }[] };
          get().updateUiOperationStatus(operationId, 'failed', {
            errorMessage: message,
            relatedCommitIds: failureContext.relatedCommitIds,
            relatedChangeIds: failureContext.relatedChangeIds,
            relatedCommitAssociations: failureContext.relatedCommitAssociations,
          });
          throw error;
        } finally {
          set({ isExecutingCommand: false });
        }
      },

      // Intention-based UI actions
      moveFileToChange: async (file, sourceChangeId, targetChangeId) => {
        const commitGraph = get().commitGraph;
        const sourceStable = commitGraph?.[sourceChangeId]?.commit.changeId as ChangeId | undefined;
        const targetStable = commitGraph?.[targetChangeId]?.commit.changeId as ChangeId | undefined;
        const command: IntentionCommand = {
          type: 'move-file-to-change',
          file,
          sourceChangeId,
          targetChangeId,
          sourceChangeStableId: sourceStable,
          targetChangeStableId: targetStable,
        };
        await get().executeCommand(command);
      },

      splitFileFromChange: async (file, sourceChangeId, position) => {
        const commitGraph = get().commitGraph;
        const sourceStable = commitGraph?.[sourceChangeId]?.commit.changeId as ChangeId | undefined;
        const command: IntentionCommand = {
          type: 'split-file-from-change',
          file,
          sourceChangeId,
          position,
          sourceChangeStableId: sourceStable,
        };
        await get().executeCommand(command);
      },

      rebaseChange: async (changeId, position) => {
        const commitGraph = get().commitGraph;
        const stableId = commitGraph?.[changeId]?.commit.changeId as ChangeId | undefined;
        const command: IntentionCommand = {
          type: 'rebase-change',
          changeId,
          position,
          changeStableId: stableId,
        };
        await get().executeCommand(command);
      },

      reorderChange: async (changeId, position) => {
        const commitGraph = get().commitGraph;
        const stableId = commitGraph?.[changeId]?.commit.changeId as ChangeId | undefined;
        const command: IntentionCommand = {
          type: 'reorder-change',
          changeId,
          position,
          changeStableId: stableId,
        };
        await get().executeCommand(command);
      },

      squashChangeInto: async (sourceChangeId, targetChangeId) => {
        const commitGraph = get().commitGraph;
        const sourceStable = commitGraph?.[sourceChangeId]?.commit.changeId as ChangeId | undefined;
        const targetStable = commitGraph?.[targetChangeId]?.commit.changeId as ChangeId | undefined;
        const command: IntentionCommand = {
          type: 'squash-change-into',
          sourceChangeId,
          targetChangeId,
          sourceChangeStableId: sourceStable,
          targetChangeStableId: targetStable,
        };
        await get().executeCommand(command);
      },

      splitAtEvoLog: async (changeId, entryCommitId) => {
        const commitGraph = get().commitGraph;
        const stableId = commitGraph?.[changeId]?.commit.changeId as ChangeId | undefined;
        const entryStable = commitGraph?.[entryCommitId]?.commit.changeId as ChangeId | undefined;
        const command: IntentionCommand = {
          type: 'split-at-evolog',
          changeId,
          entryCommitId,
          changeStableId: stableId,
          entryChangeStableId: entryStable,
        };
        await get().executeCommand(command);
      },

      createNewChange: async (files, position) => {
        const command: IntentionCommand = {
          type: 'create-new-change',
          files,
          position,
        };
        await get().executeCommand(command);
      },

      updateChangeDescription: async (commitId, description) => {
        const commitGraph = get().commitGraph;
        const changeStableId = commitGraph?.[commitId]?.commit.changeId as ChangeId | undefined;
        const command: IntentionCommand = {
          type: 'update-change-description',
          commitId,
          description,
          changeStableId,
        };
        await get().executeCommand(command);
      },

      abandonChange: async (commitId) => {
        const commitGraph = get().commitGraph;
        const changeStableId = commitGraph?.[commitId]?.commit.changeId as ChangeId | undefined;
        const command: IntentionCommand = {
          type: 'abandon-change',
          commitId,
          changeStableId,
        };
        await get().executeCommand(command);
      },

      checkoutChange: async (commitId) => {
        const commitGraph = get().commitGraph;
        const changeStableId = commitGraph?.[commitId]?.commit.changeId as ChangeId | undefined;
        const command: IntentionCommand = {
          type: 'checkout-change',
          commitId,
          changeStableId,
        };
        await get().executeCommand(command);
      },

      moveBookmark: async (bookmarkName, targetCommitId) => {
        const commitGraph = get().commitGraph;
        const targetStable = commitGraph?.[targetCommitId]?.commit.changeId as ChangeId | undefined;
        const command: IntentionCommand = {
          type: 'move-bookmark',
          bookmarkName,
          targetCommitId,
          targetChangeStableId: targetStable,
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
        const commitGraph = get().commitGraph;
        const targetStable = commitGraph?.[targetCommitId]?.commit.changeId as ChangeId | undefined;
        const command: IntentionCommand = {
          type: 'add-bookmark',
          bookmarkName,
          targetCommitId,
          targetChangeStableId: targetStable,
        };
        await get().executeCommand(command);
      },

      executeHunkSplit: async (sourceCommitId, hunkRanges, position, description) => {
        const commitGraph = get().commitGraph;
        const sourceStable = commitGraph?.[sourceCommitId]?.commit.changeId as ChangeId | undefined;
        const command: IntentionCommand = {
          type: 'hunk-split',
          sourceCommitId,
          hunkRanges,
          position,
          description,
          sourceChangeStableId: sourceStable,
        };
        await get().executeCommand(command);
      },

      executeRebase: async (commitId, target) => {
        const { repoPath } = get();
        if (!repoPath) {
          console.error('Cannot execute rebase: no repository path set');
          return;
        }
        const commitGraph = get().commitGraph;
        const changeStableId = commitGraph?.[commitId]?.commit.changeId as ChangeId | undefined;

        const command: GitCommand = { type: 'rebase', commitId, target, changeStableId };
        console.log('🔄 REBASE COMMAND:', command);
        const operationId = get().logUiOperation({
          description: describeLegacyGitCommand(command),
          kind: { type: 'legacy-command', command },
        });

        set({ isExecutingCommand: true });

        try {
          const response = await mutations.executeCommand.mutate({ repoPath, command }) as CommandExecutionResult;
          console.log('✅ Rebase command executed successfully');
          applyCommandOutcome(response, operationId);
        } catch (error) {
          console.error('❌ Rebase command execution failed:', error);
          const message = error instanceof Error ? error.message : String(error);
          const failureEntry = get().uiOperationLog.find(item => item.id === operationId);
          const failureContext = failureEntry
            ? deriveOperationContext(failureEntry.kind, get().commitGraph, failureEntry.relatedCommitAssociations)
            : { relatedCommitIds: [] as CommitId[], relatedChangeIds: [] as ChangeId[], relatedCommitAssociations: [] as { commitId: CommitId; changeId?: ChangeId }[] };
          get().updateUiOperationStatus(operationId, 'failed', {
            errorMessage: message,
            relatedCommitIds: failureContext.relatedCommitIds,
            relatedChangeIds: failureContext.relatedChangeIds,
            relatedCommitAssociations: failureContext.relatedCommitAssociations,
          });
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
        const commitGraph = get().commitGraph;
        const sourceStable = commitGraph?.[sourceCommitId]?.commit.changeId as ChangeId | undefined;
        const targetStable = commitGraph?.[targetCommitId]?.commit.changeId as ChangeId | undefined;

        const command: GitCommand = { type: 'squash', sourceCommitId, targetCommitId, sourceChangeStableId: sourceStable, targetChangeStableId: targetStable };
        console.log('🔧 SQUASH COMMAND:', command);
        const operationId = get().logUiOperation({
          description: describeLegacyGitCommand(command),
          kind: { type: 'legacy-command', command },
        });

        set({ isExecutingCommand: true });

        try {
          const response = await mutations.executeCommand.mutate({ repoPath, command }) as CommandExecutionResult;
          console.log('✅ Squash command executed successfully');
          applyCommandOutcome(response, operationId);
        } catch (error) {
          console.error('❌ Squash command execution failed:', error);
          const message = error instanceof Error ? error.message : String(error);
          const failureEntry = get().uiOperationLog.find(item => item.id === operationId);
          const failureContext = failureEntry
            ? deriveOperationContext(failureEntry.kind, get().commitGraph, failureEntry.relatedCommitAssociations)
            : { relatedCommitIds: [] as CommitId[], relatedChangeIds: [] as ChangeId[], relatedCommitAssociations: [] as { commitId: CommitId; changeId?: ChangeId }[] };
          get().updateUiOperationStatus(operationId, 'failed', {
            errorMessage: message,
            relatedCommitIds: failureContext.relatedCommitIds,
            relatedChangeIds: failureContext.relatedChangeIds,
            relatedCommitAssociations: failureContext.relatedCommitAssociations,
          });
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
        const commitGraph = get().commitGraph;
        const sourceStable = commitGraph?.[sourceCommitId]?.commit.changeId as ChangeId | undefined;

        const command: GitCommand = { type: 'split', sourceCommitId, files, target, sourceChangeStableId: sourceStable };
        console.log('✂️ SPLIT COMMAND:', command);
        const operationId = get().logUiOperation({
          description: describeLegacyGitCommand(command),
          kind: { type: 'legacy-command', command },
        });

        set({ isExecutingCommand: true });

        try {
          const response = await mutations.executeCommand.mutate({ repoPath, command }) as CommandExecutionResult;
          console.log('✅ Split command executed successfully');
          applyCommandOutcome(response, operationId);
        } catch (error) {
          console.error('❌ Split command execution failed:', error);
          const message = error instanceof Error ? error.message : String(error);
          const failureEntry = get().uiOperationLog.find(item => item.id === operationId);
          const failureContext = failureEntry
            ? deriveOperationContext(failureEntry.kind, get().commitGraph, failureEntry.relatedCommitAssociations)
            : { relatedCommitIds: [] as CommitId[], relatedChangeIds: [] as ChangeId[], relatedCommitAssociations: [] as { commitId: CommitId; changeId?: ChangeId }[] };
          get().updateUiOperationStatus(operationId, 'failed', {
            errorMessage: message,
            relatedCommitIds: failureContext.relatedCommitIds,
            relatedChangeIds: failureContext.relatedChangeIds,
            relatedCommitAssociations: failureContext.relatedCommitAssociations,
          });
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
        const commitGraph = get().commitGraph;
        const sourceStable = commitGraph?.[sourceCommitId]?.commit.changeId as ChangeId | undefined;
        const targetStable = commitGraph?.[targetCommitId]?.commit.changeId as ChangeId | undefined;

        const command: GitCommand = { type: 'move-files', sourceCommitId, targetCommitId, files, sourceChangeStableId: sourceStable, targetChangeStableId: targetStable };
        console.log('📁 MOVE FILES COMMAND:', command);
        const operationId = get().logUiOperation({
          description: describeLegacyGitCommand(command),
          kind: { type: 'legacy-command', command },
        });

        set({ isExecutingCommand: true });

        try {
          const response = await mutations.executeCommand.mutate({ repoPath, command }) as CommandExecutionResult;
          console.log('✅ Move files command executed successfully');
          applyCommandOutcome(response, operationId);
        } catch (error) {
          console.error('❌ Move files command execution failed:', error);
          const message = error instanceof Error ? error.message : String(error);
          const failureEntry = get().uiOperationLog.find(item => item.id === operationId);
          const failureContext = failureEntry
            ? deriveOperationContext(failureEntry.kind, get().commitGraph, failureEntry.relatedCommitAssociations)
            : { relatedCommitIds: [] as CommitId[], relatedChangeIds: [] as ChangeId[], relatedCommitAssociations: [] as { commitId: CommitId; changeId?: ChangeId }[] };
          get().updateUiOperationStatus(operationId, 'failed', {
            errorMessage: message,
            relatedCommitIds: failureContext.relatedCommitIds,
            relatedChangeIds: failureContext.relatedChangeIds,
            relatedCommitAssociations: failureContext.relatedCommitAssociations,
          });
          throw error;
        } finally {
          set({ isExecutingCommand: false });
        }
      },
    };
  },
    {
      name: 'graph-store',
    }
  )
);
