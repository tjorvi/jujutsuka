import { createContext, useContext } from 'react';
import type { CommitId, FileChange } from "../../backend/src/repo-parser";

interface DragDropContextType {
  draggedFile: FileChange | null;
  setDraggedFile: (file: FileChange | null) => void;
  draggedFromCommit: CommitId | null;
  setDraggedFromCommit: (commitId: CommitId | null) => void;
  draggedCommit: CommitId | null;
  setDraggedCommit: (commitId: CommitId | null) => void;
  
  // Domain command actions
  handleFileDrop: (targetCommitId: CommitId, insertType?: 'before' | 'after' | 'branch' | 'existing', beforeCommitId?: CommitId, afterCommitId?: CommitId) => void;
  handleCommitDrop: (targetCommitId: CommitId, action: 'rebase-before' | 'rebase-after' | 'squash') => void;
}

export const DragDropContext = createContext<DragDropContextType | null>(null);

export function useDragDrop() {
  const context = useContext(DragDropContext);
  if (!context) {
    throw new Error('useDragDrop must be used within a DragDropProvider');
  }
  return context;
}
