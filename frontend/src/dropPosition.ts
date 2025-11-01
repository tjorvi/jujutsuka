import type { CommitId } from "../../backend/src/repo-parser";

export type DropPosition =
  | {
      kind: 'between';
      beforeCommit: CommitId;
      afterCommit: CommitId;
    }
  | {
      kind: 'after';
      commit: CommitId;
    }
  | {
      kind: 'before';
      commit: CommitId;
    }
  | {
      kind: 'new-branch';
      commit: CommitId;
    }
  | {
      kind: 'existing';
      commit: CommitId;
    };
