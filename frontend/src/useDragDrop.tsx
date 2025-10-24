import { createContext, useContext } from 'react';
import type { ChangeId, CommitId } from "../../backend/src/repo-parser";
import { z } from 'zod';

const changeDragDataSchema = z.object({
  source: z.literal('change'),
  changeId: z.string().transform((val) => val as ChangeId),
  commitId: z.string().transform((val) => val as CommitId),
});
export type ChangeDragData = z.infer<typeof changeDragDataSchema>;

const fileChangeDragDataSchema = z.object({
  source: z.literal('file-change'),
  fileChange: z.object({
    path: z.string(),
    status: z.enum(['M', 'A', 'D', 'R', 'C']),
    additions: z.number().optional(),
    deletions: z.number().optional(),
  }),
  fromChangeId: z.string().transform((val) => val as ChangeId),
  fromCommitId: z.string().transform((val) => val as CommitId),
});
export type FileChangeDragData = z.infer<typeof fileChangeDragDataSchema>;

export function dragChange(e: React.DragEvent, data: ChangeDragData) {
  e.dataTransfer.setData('application/json', JSON.stringify(data));
  e.dataTransfer.effectAllowed = 'move';
}

export function draggedChange(e: React.DragEvent): ChangeDragData | null {
  const data = e.dataTransfer.getData('application/json');
  if (!data) return null;
  try {
    const parsed = JSON.parse(data);
    return changeDragDataSchema.parse(parsed);
  } catch {
    return null;
  }
}

export function dragFileChange(e: React.DragEvent, data: FileChangeDragData) {
  e.dataTransfer.setData('application/json', JSON.stringify(data));
}

export function draggedFileChange(e: React.DragEvent) {
  const data = e.dataTransfer.getData('application/json');
  if (!data) return null;
  try {
    const parsed = JSON.parse(data);
    return fileChangeDragDataSchema.parse(parsed);
  } catch {
    return null;
  }
}



export type DropZonePosition = {
  kind: 'between',
  beforeCommit: CommitId;
  afterCommit: CommitId;
}
| { kind: 'after', commit: CommitId }
| { kind: 'before', commit: CommitId }
| { kind: 'new-branch', commit: CommitId }
| { kind: 'existing', commit: CommitId };

type CommitDropMode = 'rebase' | 'squash';

interface DragDropContextType {

  // Domain command actions
  handleFileDrop: (position: DropZonePosition, dragData: FileChangeDragData) => void;
  handleCommitDrop: (position: DropZonePosition, dragData: ChangeDragData, options?: { mode?: CommitDropMode }) => void;
}

export const DragDropContext = createContext<DragDropContextType | null>(null);

export function useDragDrop() {
  const context = useContext(DragDropContext);
  if (!context) {
    throw new Error('useDragDrop must be used within a DragDropProvider');
  }
  return context;
}
