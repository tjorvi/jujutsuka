import type { CommitId, ChangeId, FileChange, CommandTarget } from "../../backend/src/repo-parser";

// Re-export CommandTarget for convenience
export type { CommandTarget };

// Domain commands for git operations
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

export type GitCommand = RebaseCommand | SquashCommand | SplitCommand | MoveFilesCommand;