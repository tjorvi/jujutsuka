import type { CommitId, FileChange, CommandTarget } from "../../backend/src/repo-parser";

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
  evoLogIndex: number; // Which evolog entry to split at
  files?: FileChange[]; // Optional: specific files to split
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
  | CheckoutChangeCommand;

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
