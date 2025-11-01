import type { CommitId, ChangeId, FileChange, CommandTarget, BookmarkName } from "../../backend/src/repo-parser";

// Re-export CommandTarget for convenience
export type { CommandTarget };

// Intention-based commands framed in the context of our UIs

// File manipulation intentions
export interface MoveFileToChangeCommand {
  type: 'move-file-to-change';
  file: FileChange;
  sourceChangeId: CommitId;
  targetChangeId: CommitId;
  sourceChangeStableId?: ChangeId;
  targetChangeStableId?: ChangeId;
}

export interface SplitFileFromChangeCommand {
  type: 'split-file-from-change';
  file: FileChange;
  sourceChangeId: CommitId;
  target: CommandTarget; // Where to put the new change
  sourceChangeStableId?: ChangeId;
}

// Change manipulation intentions
export interface RebaseChangeCommand {
  type: 'rebase-change';
  changeId: CommitId;
  changeStableId?: ChangeId;
  newParent: CommandTarget;
}

export interface ReorderChangeCommand {
  type: 'reorder-change';
  changeId: CommitId;
  newPosition: CommandTarget;
  changeStableId?: ChangeId;
}

export interface SquashChangeIntoCommand {
  type: 'squash-change-into';
  sourceChangeId: CommitId;
  targetChangeId: CommitId;
  sourceChangeStableId?: ChangeId;
  targetChangeStableId?: ChangeId;
}

// Evolog-based intentions
export interface SplitAtEvoLogCommand {
  type: 'split-at-evolog';
  changeId: CommitId;
  entryCommitId: CommitId; // Commit snapshot from the evolog to resurrect
  changeStableId?: ChangeId;
  entryChangeStableId?: ChangeId;
}

// Create new change intentions
export interface CreateNewChangeCommand {
  type: 'create-new-change';
  files: FileChange[];
  parent: CommandTarget;
}

export interface UpdateChangeDescriptionCommand {
  type: 'update-change-description';
  commitId: CommitId;
  description: string;
  changeStableId?: ChangeId;
}

export interface AbandonChangeCommand {
  type: 'abandon-change';
  commitId: CommitId;
  changeStableId?: ChangeId;
}

export interface CheckoutChangeCommand {
  type: 'checkout-change';
  commitId: CommitId;
  changeStableId?: ChangeId;
}

// Bookmark manipulation intentions
export interface MoveBookmarkCommand {
  type: 'move-bookmark';
  bookmarkName: BookmarkName;
  targetCommitId: CommitId;
  targetChangeStableId?: ChangeId;
}

export interface DeleteBookmarkCommand {
  type: 'delete-bookmark';
  bookmarkName: BookmarkName;
}

export interface AddBookmarkCommand {
  type: 'add-bookmark';
  bookmarkName: BookmarkName;
  targetCommitId: CommitId;
  targetChangeStableId?: ChangeId;
}

export interface HunkRange {
  filePath: string;
  startLine: number;
  endLine: number;
}

export interface HunkSplitCommand {
  type: 'hunk-split';
  sourceCommitId: CommitId;
  hunkRanges: HunkRange[];
  target: CommandTarget;
  description?: string;
  sourceChangeStableId?: ChangeId;
}

export type IntentionCommand =
  | MoveFileToChangeCommand
  | SplitFileFromChangeCommand
  | RebaseChangeCommand
  | ReorderChangeCommand
  | SquashChangeIntoCommand
  | SplitAtEvoLogCommand
  | CreateNewChangeCommand
  | UpdateChangeDescriptionCommand
  | AbandonChangeCommand
  | CheckoutChangeCommand
  | MoveBookmarkCommand
  | DeleteBookmarkCommand
  | AddBookmarkCommand
  | HunkSplitCommand;

// Legacy low-level commands (for backwards compatibility during transition)
export interface RebaseCommand {
  type: 'rebase';
  commitId: CommitId;
  target: CommandTarget;
  changeStableId?: ChangeId;
}

export interface SquashCommand {
  type: 'squash';
  sourceCommitId: CommitId;
  targetCommitId: CommitId;
  sourceChangeStableId?: ChangeId;
  targetChangeStableId?: ChangeId;
}

export interface SplitCommand {
  type: 'split';
  sourceCommitId: CommitId;
  files: FileChange[];
  target: CommandTarget;
  sourceChangeStableId?: ChangeId;
}

export interface MoveFilesCommand {
  type: 'move-files';
  sourceCommitId: CommitId;
  targetCommitId: CommitId;
  files: FileChange[];
  sourceChangeStableId?: ChangeId;
  targetChangeStableId?: ChangeId;
}

export type LegacyCommand = RebaseCommand | SquashCommand | SplitCommand | MoveFilesCommand;

// Union of all commands
export type GitCommand = IntentionCommand | LegacyCommand;
