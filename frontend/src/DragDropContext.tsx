import type { CommitId } from "../../backend/src/repo-parser";
import { DragDropContext, type FileChangeDragData, type ChangeDragData, type DropZonePosition, type BookmarkDragData, type HunkDragData } from './useDragDrop';
import { useGraphStore } from './graphStore';

export function DragDropProvider({ children }: { children: React.ReactNode }) {
  const { rebaseChange, executeSquash, executeSplit, executeMoveFiles, moveBookmark, executeHunkSplit } = useGraphStore();
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
      void rebaseChange(draggedCommitId, position);
    } else if (position.kind === 'between') {
      const { beforeCommit, afterCommit } = position;

      if (isAncestor(beforeCommit, draggedCommitId)) {
        void rebaseChange(draggedCommitId, { kind: 'before', commit: beforeCommit });
        return;
      }

      if (isAncestor(afterCommit, draggedCommitId)) {
        void rebaseChange(draggedCommitId, { kind: 'after', commit: afterCommit });
        return;
      }

      if (isAncestor(draggedCommitId, beforeCommit)) {
        void rebaseChange(draggedCommitId, { kind: 'after', commit: beforeCommit });
        return;
      }

      if (isAncestor(draggedCommitId, afterCommit)) {
        void rebaseChange(draggedCommitId, { kind: 'before', commit: afterCommit });
        return;
      }

      void rebaseChange(draggedCommitId, position);
    } else if (position.kind === 'new-branch') {
      void rebaseChange(draggedCommitId, position);
    } else if (position.kind === 'existing') {
      void rebaseChange(draggedCommitId, position);
    }
  };

  const handleBookmarkDrop = (position: DropZonePosition, dragData: BookmarkDragData) => {
    if (position.kind !== 'existing') {
      return;
    }

    void moveBookmark(dragData.bookmarkName, position.commit);
  };

  const handleHunkDrop = (position: DropZonePosition, dragData: HunkDragData) => {
    const { filePath, startLine, endLine, fromCommitId } = dragData;
    const hunkRanges = [{ filePath, startLine, endLine }];

    if (position.kind === 'existing') {
      // For existing commits, we'll need evosquash which isn't implemented yet
      // But we'll still implement the handler for consistency
      console.warn('Dropping hunks onto existing commits requires evosquash, which is not yet implemented');
      // When evosquash is available, we would do:
      // executeHunkSplit(fromCommitId, hunkRanges, { type: 'existing-commit', commitId: position.commit });
      return;
    } else if (position.kind === 'new-branch') {
      executeHunkSplit(fromCommitId, hunkRanges, position);
    } else if (position.kind === 'between') {
      executeHunkSplit(fromCommitId, hunkRanges, position);
    } else if (position.kind === 'before') {
      executeHunkSplit(fromCommitId, hunkRanges, position);
    } else if (position.kind === 'after') {
      executeHunkSplit(fromCommitId, hunkRanges, position);
    }
  };

  return (
    <DragDropContext.Provider value={{
      handleFileDrop,
      handleCommitDrop,
      handleBookmarkDrop,
      handleHunkDrop,
    }}>
      {children}
    </DragDropContext.Provider>
  );
}
