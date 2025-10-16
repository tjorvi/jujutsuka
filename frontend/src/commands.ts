import type { CommitId, FileChange, CommandTarget } from "../../backend/src/repo-parser";

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

export type GitCommand = RebaseCommand | SquashCommand | SplitCommand;