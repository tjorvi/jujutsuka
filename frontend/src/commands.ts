import type { CommitId, FileChange } from "../../backend/src/repo-parser";

// Domain commands for git operations
// Target types that are shared between commands
export type CommandTarget = {
  type: 'before' | 'after';
  commitId: CommitId;
} | {
  type: 'new-branch';
  fromCommitId: CommitId;
} | {
  type: 'new-commit-between';
  beforeCommitId: CommitId;
  afterCommitId: CommitId;
} | {
  type: 'existing-commit';
  commitId: CommitId;
};

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