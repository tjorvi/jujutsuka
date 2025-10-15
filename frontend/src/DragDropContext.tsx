import { useState } from 'react';
import type { CommitId, FileChange } from "../../backend/src/repo-parser";
import { DragDropContext } from './useDragDrop';
import { useGraphStore } from './graphStore';

export function DragDropProvider({ children }: { children: React.ReactNode }) {
  const [draggedFile, setDraggedFile] = useState<FileChange | null>(null);
  const [draggedFromCommit, setDraggedFromCommit] = useState<CommitId | null>(null);
  const [draggedCommit, setDraggedCommit] = useState<CommitId | null>(null);
  
  const { executeRebase, executeSquash, executeSplit } = useGraphStore();

  const handleFileDrop = (targetCommitId: CommitId, insertType: 'before' | 'after' | 'branch' | 'existing' = 'before', beforeCommitId?: CommitId, afterCommitId?: CommitId) => {
    if (!draggedFile || !draggedFromCommit) return;
    
    if (insertType === 'existing') {
      // Split to existing commit (move files)
      executeSplit(draggedFromCommit, [draggedFile], {
        type: 'existing-commit',
        commitId: targetCommitId
      });
    } else if (insertType === 'branch') {
      // Split to new branch
      executeSplit(draggedFromCommit, [draggedFile], {
        type: 'new-branch',
        fromCommitId: targetCommitId
      });
    } else if (beforeCommitId && afterCommitId) {
      // Split to new commit between two commits (using -B and -A)
      executeSplit(draggedFromCommit, [draggedFile], {
        type: 'new-commit-between',
        beforeCommitId,
        afterCommitId
      });
    } else {
      // Split to new commit before/after target (fallback)
      executeSplit(draggedFromCommit, [draggedFile], {
        type: insertType === 'before' ? 'before' : 'after',
        commitId: targetCommitId
      });
    }
    
    // Clear drag state
    setDraggedFile(null);
    setDraggedFromCommit(null);
  };

  const handleCommitDrop = (targetCommitId: CommitId, action: 'rebase-before' | 'rebase-after' | 'squash') => {
    if (!draggedCommit) return;
    
    if (action === 'squash') {
      executeSquash(draggedCommit, targetCommitId);
    } else {
      executeRebase(draggedCommit, {
        type: action === 'rebase-before' ? 'before' : 'after',
        commitId: targetCommitId
      });
    }
    
    // Clear drag state
    setDraggedCommit(null);
  };

  return (
    <DragDropContext.Provider value={{ 
      draggedFile, 
      setDraggedFile, 
      draggedFromCommit, 
      setDraggedFromCommit,
      draggedCommit,
      setDraggedCommit,
      handleFileDrop,
      handleCommitDrop,
    }}>
      {children}
    </DragDropContext.Provider>
  );
}