import { useState, createContext, useContext } from 'react';
import type { CommitId, FileChange } from "../../backend/src/repo-parser";

interface DragDropContextType {
  draggedFile: FileChange | null;
  setDraggedFile: (file: FileChange | null) => void;
  draggedFromCommit: CommitId | null;
  setDraggedFromCommit: (commitId: CommitId | null) => void;
}

const DragDropContext = createContext<DragDropContextType | null>(null);

export function useDragDrop() {
  const context = useContext(DragDropContext);
  if (!context) {
    throw new Error('useDragDrop must be used within a DragDropProvider');
  }
  return context;
}

export function DragDropProvider({ children }: { children: React.ReactNode }) {
  const [draggedFile, setDraggedFile] = useState<FileChange | null>(null);
  const [draggedFromCommit, setDraggedFromCommit] = useState<CommitId | null>(null);

  return (
    <DragDropContext.Provider value={{ 
      draggedFile, 
      setDraggedFile, 
      draggedFromCommit, 
      setDraggedFromCommit 
    }}>
      {children}
    </DragDropContext.Provider>
  );
}