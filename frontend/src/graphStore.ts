import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { match } from 'ts-pattern';
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
  match(position)
    .with({ kind: 'before' }, (p) => addCommit(p.commit))
    .with({ kind: 'after' }, (p) => addCommit(p.commit))
    .with({ kind: 'existing-commit' }, (p) => addCommit(p.commit))
    .with({ kind: 'between-commits' }, (p) => {
      addCommit(p.beforeCommit);
      addCommit(p.afterCommit);
    })
    .with({ kind: 'new-branch' }, (p) => addCommit(p.commit))
    .exhaustive();
}

function addCommitFromLegacyTarget(target: CommandTarget | null | undefined, addCommit: (id: CommitId) => void) {
  if (!target) {
    return;
  }
  match(target)
    .with({ kind: 'before' }, (t) => addCommit(t.commit))
    .with({ kind: 'after' }, (t) => addCommit(t.commit))
    .with({ kind: 'existing-commit' }, (t) => addCommit(t.commit))
    .with({ kind: 'between-commits' }, (t) => {
      addCommit(t.beforeCommit);
      addCommit(t.afterCommit);
    })
    .with({ kind: 'new-branch' }, (t) => addCommit(t.commit))
    .exhaustive();
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
    match(command)
      .with({ type: 'move-file-to-change' }, (cmd) => {
        addCommit(cmd.sourceChangeId, cmd.sourceChangeStableId ?? null);
        addCommit(cmd.targetChangeId, cmd.targetChangeStableId ?? null);
      })
      .with({ type: 'split-file-from-change' }, (cmd) => {
        addCommit(cmd.sourceChangeId, cmd.sourceChangeStableId ?? null);
        addCommitFromPosition(cmd.position, addCommit);
      })
      .with({ type: 'rebase-change' }, (cmd) => {
        addCommit(cmd.changeId, cmd.changeStableId ?? null);
        addCommitFromPosition(cmd.position, addCommit);
      })
      .with({ type: 'reorder-change' }, (cmd) => {
        addCommit(cmd.changeId, cmd.changeStableId ?? null);
        addCommitFromPosition(cmd.position, addCommit);
      })
      .with({ type: 'squash-change-into' }, (cmd) => {
        addCommit(cmd.sourceChangeId, cmd.sourceChangeStableId ?? null);
        addCommit(cmd.targetChangeId, cmd.targetChangeStableId ?? null);
      })
      .with({ type: 'split-at-evolog' }, (cmd) => {
        addCommit(cmd.changeId, cmd.changeStableId ?? null);
        addCommit(cmd.entryCommitId, cmd.entryChangeStableId ?? null);
      })
      .with({ type: 'create-new-change' }, (cmd) => {
        addCommitFromPosition(cmd.position, addCommit);
      })
      .with({ type: 'update-change-description' }, (cmd) => {
        addCommit(cmd.commitId, cmd.changeStableId ?? null);
      })
      .with({ type: 'checkout-change' }, (cmd) => {
        addCommit(cmd.commitId, cmd.changeStableId ?? null);
      })
      .with({ type: 'abandon-change' }, (cmd) => {
        addCommit(cmd.commitId, cmd.changeStableId ?? null);
      })
      .with({ type: 'move-bookmark' }, (cmd) => {
        addCommit(cmd.targetCommitId, cmd.targetChangeStableId ?? null);
      })
      .with({ type: 'add-bookmark' }, (cmd) => {
        addCommit(cmd.targetCommitId, cmd.targetChangeStableId ?? null);
      })
      .with({ type: 'delete-bookmark' }, () => {
        // No commits to add
      })
      .with({ type: 'hunk-split' }, (cmd) => {
        addCommit(cmd.sourceCommitId, cmd.sourceChangeStableId ?? null);
        addCommitFromPosition(cmd.position, addCommit);
      })
      .with({ type: 'move-files' }, (cmd) => {
        addCommit(cmd.sourceCommitId, cmd.sourceChangeStableId ?? null);
        addCommit(cmd.targetCommitId, cmd.targetChangeStableId ?? null);
      })
      .with({ type: 'rebase' }, (cmd) => {
        addCommit(cmd.commitId, cmd.changeStableId ?? null);
        addCommitFromLegacyTarget(cmd.target, addCommit);
      })
      .with({ type: 'squash' }, (cmd) => {
        addCommit(cmd.sourceCommitId, cmd.sourceChangeStableId ?? null);
        addCommit(cmd.targetCommitId, cmd.targetChangeStableId ?? null);
      })
      .with({ type: 'split' }, (cmd) => {
        addCommit(cmd.sourceCommitId, cmd.sourceChangeStableId ?? null);
        addCommitFromLegacyTarget(cmd.target, addCommit);
      })
      .exhaustive();
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

function shortId(id: string): string {
  return id.length <= 8 ? id : id.slice(0, 8);
}

function summariseDropPosition(position: DropPosition): string {
  return match(position)
    .with({ kind: 'before' }, (p) => `before ${shortId(p.commit)}`)
    .with({ kind: 'after' }, (p) => `after ${shortId(p.commit)}`)
    .with({ kind: 'between-commits' }, (p) => `after ${shortId(p.beforeCommit)} and before ${shortId(p.afterCommit)}`)
    .with({ kind: 'new-branch' }, (p) => `new branch from ${shortId(p.commit)}`)
    .with({ kind: 'existing-commit' }, (p) => `existing commit ${shortId(p.commit)}`)
    .exhaustive();
}

function summariseCommandTarget(target: CommandTarget): string {
  return match(target)
    .with({ kind: 'before' }, (t) => `before ${shortId(t.commit)}`)
    .with({ kind: 'after' }, (t) => `after ${shortId(t.commit)}`)
    .with({ kind: 'between-commits' }, (t) => `after ${shortId(t.beforeCommit)} and before ${shortId(t.afterCommit)}`)
    .with({ kind: 'new-branch' }, (t) => `new branch from ${shortId(t.commit)}`)
    .with({ kind: 'existing-commit' }, (t) => `existing commit ${shortId(t.commit)}`)
    .exhaustive();
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
  return match(command)
    .with({ type: 'move-file-to-change' }, (cmd) =>
      `Move ${cmd.file.path} from ${shortId(cmd.sourceChangeId)} to ${shortId(cmd.targetChangeId)}`)
    .with({ type: 'split-file-from-change' }, (cmd) =>
      `Split ${cmd.file.path} from ${shortId(cmd.sourceChangeId)} to ${summariseDropPosition(cmd.position)}`)
    .with({ type: 'rebase-change' }, (cmd) =>
      `Rebase ${shortId(cmd.changeId)} onto ${summariseDropPosition(cmd.position)}`)
    .with({ type: 'reorder-change' }, (cmd) =>
      `Reorder ${shortId(cmd.changeId)} to ${summariseDropPosition(cmd.position)}`)
    .with({ type: 'squash-change-into' }, (cmd) =>
      `Squash ${shortId(cmd.sourceChangeId)} into ${shortId(cmd.targetChangeId)}`)
    .with({ type: 'split-at-evolog' }, (cmd) =>
      `Split ${shortId(cmd.changeId)} at evolog entry ${shortId(cmd.entryCommitId)}`)
    .with({ type: 'create-new-change' }, (cmd) =>
      `Create change at ${summariseDropPosition(cmd.position)} with ${describeFileCount(cmd.files)}`)
    .with({ type: 'update-change-description' }, (cmd) => {
      const snippet = cmd.description.trim().replace(/\s+/g, ' ');
      const truncated = snippet.length > 60 ? `${snippet.slice(0, 57)}...` : snippet;
      return `Update description for ${shortId(cmd.commitId)} to "${truncated}"`;
    })
    .with({ type: 'abandon-change' }, (cmd) =>
      `Abandon change ${shortId(cmd.commitId)}`)
    .with({ type: 'checkout-change' }, (cmd) =>
      `Checkout change ${shortId(cmd.commitId)}`)
    .with({ type: 'move-bookmark' }, (cmd) =>
      `Move bookmark ${String(cmd.bookmarkName)} to ${shortId(cmd.targetCommitId)}`)
    .with({ type: 'delete-bookmark' }, (cmd) =>
      `Delete bookmark ${String(cmd.bookmarkName)}`)
    .with({ type: 'add-bookmark' }, (cmd) =>
      `Add bookmark ${String(cmd.bookmarkName)} at ${shortId(cmd.targetCommitId)}`)
    .with({ type: 'hunk-split' }, (cmd) => {
      const count = cmd.hunkRanges.length;
      return `Split ${count} hunk${count === 1 ? '' : 's'} from ${shortId(cmd.sourceCommitId)} to ${summariseDropPosition(cmd.position)}`;
    })
    .exhaustive();
}

function describeLegacyGitCommand(command: GitCommand): string {
  return match(command)
    .with({ type: 'rebase' }, (cmd) =>
      `Legacy rebase ${shortId(cmd.commitId)} onto ${summariseCommandTarget(cmd.target)}`)
    .with({ type: 'squash' }, (cmd) =>
      `Legacy squash ${shortId(cmd.sourceCommitId)} into ${shortId(cmd.targetCommitId)}`)
    .with({ type: 'split' }, (cmd) =>
      `Legacy split ${shortId(cmd.sourceCommitId)} via ${summariseCommandTarget(cmd.target)} with ${describeFileCount(cmd.files)}`)
    .with({ type: 'move-files' }, (cmd) =>
      `Legacy move ${describeFileCount(cmd.files)} from ${shortId(cmd.sourceCommitId)} to ${shortId(cmd.targetCommitId)}`)
    .otherwise((cmd) => describeIntentionCommand(cmd as IntentionCommand));
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
