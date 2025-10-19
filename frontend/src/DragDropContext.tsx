import type { CommitId } from "../../backend/src/repo-parser";
import { DragDropContext, type FileChangeDragData, type ChangeDragData, type DropZonePosition } from './useDragDrop';
import { useGraphStore } from './graphStore';

export function DragDropProvider({ children }: { children: React.ReactNode }) {
  const { executeRebase, executeSquash, executeSplit, executeMoveFiles } = useGraphStore();

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

  const handleCommitDrop = (targetCommitId: CommitId, action: 'rebase-before' | 'rebase-after' | 'squash', dragData: ChangeDragData) => {
    const { commitId: draggedCommitId } = dragData;

    if (action === 'squash') {
      executeSquash(draggedCommitId, targetCommitId);
    } else {
      executeRebase(draggedCommitId, {
        type: action === 'rebase-before' ? 'before' : 'after',
        commitId: targetCommitId
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