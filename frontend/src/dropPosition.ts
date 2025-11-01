import type { CommitId } from "../../backend/src/repo-parser";

/**
 * Position type used throughout the application from UI to jj command execution.
 * Represents a location where an operation should occur - the command context
 * determines what actually happens at this position.
 *
 * Examples:
 * - 'before': Insert before the specified commit
 * - 'after': Insert after the specified commit
 * - 'between-commits': Insert between two commits (beforeCommit → new → afterCommit)
 * - 'new-branch': Create as new branch from the specified commit
 * - 'existing-commit': Target an existing commit (e.g., for squash or move operations)
 */
export type Position =
  | {
      kind: 'before';
      commit: CommitId;
    }
  | {
      kind: 'after';
      commit: CommitId;
    }
  | {
      kind: 'between-commits';
      beforeCommit: CommitId;
      afterCommit: CommitId;
    }
  | {
      kind: 'new-branch';
      commit: CommitId;
    }
  | {
      kind: 'existing-commit';
      commit: CommitId;
    };

// Legacy alias for compatibility
export type DropPosition = Position;
