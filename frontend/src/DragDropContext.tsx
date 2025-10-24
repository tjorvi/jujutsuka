import type { CommitId } from "../../backend/src/repo-parser";
import { DragDropContext, type FileChangeDragData, type ChangeDragData, type DropZonePosition } from './useDragDrop';
import { useGraphStore } from './graphStore';

export function DragDropProvider({ children }: { children: React.ReactNode }) {
  const { executeRebase, executeSquash, executeSplit, executeMoveFiles } = useGraphStore();
  const commitGraph = useGraphStore(state => state.commitGraph);

  const isAncestor = (possibleAncestor: CommitId, commitId: CommitId): boolean => {
    if (!commitGraph) return false;
    if (possibleAncestor === commitId) return false;

    const visited = new Set<CommitId>();
    const stack: CommitId[] = [...(commitGraph[commitId]?.commit.parents ?? [])];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === possibleAncestor) {
        return true;
      }
      if (visited.has(current)) continue;
      visited.add(current);
      const parents = commitGraph[current]?.commit.parents ?? [];
      for (const parent of parents) {
        if (!visited.has(parent)) {
          stack.push(parent);
        }
      }
    }

    return false;
  };

  const handleFileDrop = (position: DropZonePosition, dragData: FileChangeDragData) => {
    const { fileChange, fromCommitId } = dragData;

    if (position.kind === 'existing') {
      // Move files to existing commit
      executeMoveFiles(fromCommitId, position.commit, [fileChange]);
    } else if (position.kind === 'new-branch') {
      // Split to new branch
      executeSplit(fromCommitId, [fileChange], {
        type: 'new-branch',
        fromCommitId: position.commit
      });
    } else if (position.kind === 'between') {
      // Split to new commit between two commits (using -B and -A)
      executeSplit(fromCommitId, [fileChange], {
        type: 'new-commit-between',
        beforeCommitId: position.beforeCommit,
        afterCommitId: position.afterCommit
      });
    } else if (position.kind === 'before') {
      // Split to new commit before target
      executeSplit(fromCommitId, [fileChange], {
        type: 'before',
        commitId: position.commit
      });
    } else if (position.kind === 'after') {
      // Split to new commit after target
      executeSplit(fromCommitId, [fileChange], {
        type: 'after',
        commitId: position.commit
      });
    }
  };

  const handleCommitDrop = (position: DropZonePosition, dragData: ChangeDragData, options?: { mode?: 'rebase' | 'squash' }) => {
    const { commitId: draggedCommitId } = dragData;
    const mode = options?.mode ?? 'rebase';

    if (mode === 'squash') {
      if (position.kind !== 'existing') {
        throw new Error(`Squash requires an existing commit target, got ${position.kind}`);
      }
      executeSquash(draggedCommitId, position.commit);
      return;
    }

    if (position.kind === 'before' || position.kind === 'after') {
      executeRebase(draggedCommitId, {
        type: position.kind,
        commitId: position.commit
      });
    } else if (position.kind === 'between') {
      const { beforeCommit, afterCommit } = position;

      if (isAncestor(beforeCommit, draggedCommitId)) {
        executeRebase(draggedCommitId, {
          type: 'before',
          commitId: beforeCommit,
        });
        return;
      }

      if (isAncestor(afterCommit, draggedCommitId)) {
        executeRebase(draggedCommitId, {
          type: 'after',
          commitId: afterCommit,
        });
        return;
      }

      if (isAncestor(draggedCommitId, beforeCommit)) {
        executeRebase(draggedCommitId, {
          type: 'after',
          commitId: beforeCommit,
        });
        return;
      }

      if (isAncestor(draggedCommitId, afterCommit)) {
        executeRebase(draggedCommitId, {
          type: 'before',
          commitId: afterCommit,
        });
        return;
      }

      executeRebase(draggedCommitId, {
        type: 'between',
        beforeCommitId: beforeCommit,
        afterCommitId: afterCommit,
      });
    } else if (position.kind === 'new-branch') {
      executeRebase(draggedCommitId, {
        type: 'new-branch',
        fromCommitId: position.commit,
      });
    } else if (position.kind === 'existing') {
      executeRebase(draggedCommitId, {
        type: 'existing-commit',
        commitId: position.commit,
      });
    }
  };

  return (
    <DragDropContext.Provider value={{
      handleFileDrop,
      handleCommitDrop,
    }}>
      {children}
    </DragDropContext.Provider>
  );
}
