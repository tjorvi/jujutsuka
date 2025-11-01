import { createContext, useContext } from 'react';
import type { ChangeId, CommitId, BookmarkName } from "../../backend/src/repo-parser";
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

const bookmarkDragDataSchema = z.object({
  source: z.literal('bookmark'),
  bookmarkName: z.string().transform((val) => val as BookmarkName),
});
export type BookmarkDragData = z.infer<typeof bookmarkDragDataSchema>;

const hunkDragDataSchema = z.object({
  source: z.literal('hunk'),
  filePath: z.string(),
  startLine: z.number(),
  endLine: z.number(),
  fromCommitId: z.string().transform((val) => val as CommitId),
});
export type HunkDragData = z.infer<typeof hunkDragDataSchema>;

type DragEventLike = { dataTransfer: DataTransfer };

type ActiveDragMeta =
  | { kind: 'change'; commitId: CommitId; changeId: ChangeId }
  | { kind: 'file-change'; fromCommitId: CommitId; fromChangeId: ChangeId }
  | { kind: 'bookmark'; bookmarkName: BookmarkName }
  | { kind: 'hunk'; fromCommitId: CommitId; filePath: string };

let currentActiveDragMeta: ActiveDragMeta | null = null;

function setActiveDragMeta(meta: ActiveDragMeta | null) {
  currentActiveDragMeta = meta;
}

export function getActiveDragMeta(): ActiveDragMeta | null {
  return currentActiveDragMeta;
}

export function clearActiveDragMeta() {
  currentActiveDragMeta = null;
}

export function dragChange(e: React.DragEvent, data: ChangeDragData) {
  e.dataTransfer.setData('application/json', JSON.stringify(data));
  e.dataTransfer.effectAllowed = 'move';
  setActiveDragMeta({ kind: 'change', commitId: data.commitId, changeId: data.changeId });
}

export function draggedChange(e: DragEventLike): ChangeDragData | null {
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
  setActiveDragMeta({
    kind: 'file-change',
    fromCommitId: data.fromCommitId,
    fromChangeId: data.fromChangeId,
  });
}

export function draggedFileChange(e: DragEventLike) {
  const data = e.dataTransfer.getData('application/json');
  if (!data) return null;
  try {
    const parsed = JSON.parse(data);
    return fileChangeDragDataSchema.parse(parsed);
  } catch {
    return null;
  }
}

export function dragBookmark(e: React.DragEvent, data: BookmarkDragData) {
  e.dataTransfer.setData('application/json', JSON.stringify(data));
  e.dataTransfer.effectAllowed = 'move';
  setActiveDragMeta({ kind: 'bookmark', bookmarkName: data.bookmarkName });
}

export function draggedBookmark(e: DragEventLike): BookmarkDragData | null {
  const data = e.dataTransfer.getData('application/json');
  if (!data) return null;
  try {
    const parsed = JSON.parse(data);
    return bookmarkDragDataSchema.parse(parsed);
  } catch {
    return null;
  }
}

export function dragHunk(e: React.DragEvent, data: HunkDragData) {
  e.dataTransfer.setData('application/json', JSON.stringify(data));
  e.dataTransfer.effectAllowed = 'move';
  setActiveDragMeta({
    kind: 'hunk',
    fromCommitId: data.fromCommitId,
    filePath: data.filePath,
  });
}

export function draggedHunk(e: DragEventLike): HunkDragData | null {
  const data = e.dataTransfer.getData('application/json');
  if (!data) return null;
  try {
    const parsed = JSON.parse(data);
    return hunkDragDataSchema.parse(parsed);
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
  handleBookmarkDrop: (position: DropZonePosition, dragData: BookmarkDragData) => void;
  handleHunkDrop: (position: DropZonePosition, dragData: HunkDragData) => void;
}

export const DragDropContext = createContext<DragDropContextType | null>(null);

export function useDragDrop() {
  const context = useContext(DragDropContext);
  if (!context) {
    throw new Error('useDragDrop must be used within a DragDropProvider');
  }
  return context;
}
