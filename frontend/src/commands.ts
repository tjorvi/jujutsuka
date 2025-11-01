import type { CommitId, FileChange, CommandTarget, BookmarkName } from "../../backend/src/repo-parser";

// Re-export CommandTarget for convenience
export type { CommandTarget };

// Intention-based commands framed in the context of our UIs

// File manipulation intentions
export interface MoveFileToChangeCommand {
  type: 'move-file-to-change';
  file: FileChange;
  sourceChangeId: CommitId;
  targetChangeId: CommitId;
}

export interface SplitFileFromChangeCommand {
  type: 'split-file-from-change';
  file: FileChange;
  sourceChangeId: CommitId;
  target: CommandTarget; // Where to put the new change
}

// Change manipulation intentions
export interface RebaseChangeCommand {
  type: 'rebase-change';
  changeId: CommitId;
  newParent: CommandTarget;
}

export interface ReorderChangeCommand {
  type: 'reorder-change';
  changeId: CommitId;
  newPosition: CommandTarget;
}

export interface SquashChangeIntoCommand {
  type: 'squash-change-into';
  sourceChangeId: CommitId;
  targetChangeId: CommitId;
}

// Evolog-based intentions
export interface SplitAtEvoLogCommand {
  type: 'split-at-evolog';
  changeId: CommitId;
  entryCommitId: CommitId; // Commit snapshot from the evolog to resurrect
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
}

export interface AbandonChangeCommand {
  type: 'abandon-change';
  commitId: CommitId;
}

export interface CheckoutChangeCommand {
  type: 'checkout-change';
  commitId: CommitId;
}

// Bookmark manipulation intentions
export interface MoveBookmarkCommand {
  type: 'move-bookmark';
  bookmarkName: BookmarkName;
  targetCommitId: CommitId;
}

export interface DeleteBookmarkCommand {
  type: 'delete-bookmark';
  bookmarkName: BookmarkName;
}

export interface AddBookmarkCommand {
  type: 'add-bookmark';
  bookmarkName: BookmarkName;
  targetCommitId: CommitId;
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
}

export interface SquashCommand {
  type: 'squash';
  sourceCommitId: CommitId;
  targetCommitId: CommitId;
}

export interface SplitCommand {
  type: 'split';
  sourceCommitId: CommitId;
  files: FileChange[];
  target: CommandTarget;
}

export interface MoveFilesCommand {
  type: 'move-files';
  sourceCommitId: CommitId;
  targetCommitId: CommitId;
  files: FileChange[];
}

export type LegacyCommand = RebaseCommand | SquashCommand | SplitCommand | MoveFilesCommand;

// Union of all commands
export type GitCommand = IntentionCommand | LegacyCommand;
