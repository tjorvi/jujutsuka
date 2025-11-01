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

    if (position.kind === 'existing-commit') {
      // Move files to existing commit
      executeMoveFiles(fromCommitId, position.commit, [fileChange]);
    } else {
      // Split files to a new commit at the specified position
      executeSplit(fromCommitId, [fileChange], position);
    }
  };

  const handleCommitDrop = (position: DropZonePosition, dragData: ChangeDragData, options?: { mode?: 'rebase' | 'squash' }) => {
    const { commitId: draggedCommitId } = dragData;
    const mode = options?.mode ?? 'rebase';

    if (mode === 'squash') {
      if (position.kind !== 'existing-commit') {
        throw new Error(`Squash requires an existing commit target, got ${position.kind}`);
      }
      executeSquash(draggedCommitId, position.commit);
      return;
    }

    if (position.kind === 'before' || position.kind === 'after') {
      void rebaseChange(draggedCommitId, position);
    } else if (position.kind === 'between-commits') {
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
    } else if (position.kind === 'existing-commit') {
      void rebaseChange(draggedCommitId, position);
    }
  };

  const handleBookmarkDrop = (position: DropZonePosition, dragData: BookmarkDragData) => {
    if (position.kind !== 'existing-commit') {
      return;
    }

    void moveBookmark(dragData.bookmarkName, position.commit);
  };

  const handleHunkDrop = (position: DropZonePosition, dragData: HunkDragData) => {
    const { filePath, startLine, endLine, fromCommitId } = dragData;
    const hunkRanges = [{ filePath, startLine, endLine }];

    if (position.kind === 'existing-commit') {
      // For existing commits, we'll need evosquash which isn't implemented yet
      console.warn('Dropping hunks onto existing commits requires evosquash, which is not yet implemented');
      // When evosquash is available, we would do:
      // executeHunkSplit(fromCommitId, hunkRanges, position);
      return;
    }

    // Split hunks to a new commit at the specified position
    executeHunkSplit(fromCommitId, hunkRanges, position);
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
