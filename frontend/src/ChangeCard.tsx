import { useState, useMemo } from 'react';
import type { BookmarkName, ChangeId, Commit, CommitId } from '../../backend/src/repo-parser';
import {
  draggedFileChange,
  draggedChange,
  useDragDrop,
  draggedBookmark,
  dragBookmark,
  dragChange,
} from './useDragDrop';
import { useGraphStore } from './graphStore';
import styles from './StackGraph.module.css';

interface CommitStats {
  additions: number;
  deletions: number;
}

type HoverStateUpdater = (commitId: CommitId | null) => void;

const syntheticBookmarkNames = new Set<BookmarkName>(['@' as BookmarkName, 'git_head()' as BookmarkName]);

function isSyntheticBookmark(bookmarkName: BookmarkName): boolean {
  return syntheticBookmarkNames.has(bookmarkName);
}

function getCommitSizeIndicator(stats: CommitStats | undefined) {
  if (!stats) {
    return null;
  }

  const { additions, deletions } = stats;
  const total = additions + deletions;

  type SizeLabel = 'tiny' | 'small' | 'medium' | 'large' | 'huge';

  const size: SizeLabel =
    total === 0 ? 'tiny' :
    total <= 10 ? 'tiny' :
    total <= 50 ? 'small' :
    total <= 200 ? 'medium' :
    total <= 500 ? 'large' : 'huge';

  const label: string =
    size === 'tiny' && total === 0 ? '' :
    size === 'tiny' ? 'XS' :
    size === 'small' ? 'S' :
    size === 'medium' ? 'M' :
    size === 'large' ? 'L' : 'XL';

  const colors: Record<SizeLabel, string> = {
    tiny: '#d1d5db',
    small: '#93c5fd',
    medium: '#fbbf24',
    large: '#fb923c',
    huge: '#ef4444',
  };

  if (!label) {
    return null;
  }

  return {
    label,
    color: colors[size],
    tooltip: `+${additions} -${deletions}`,
  };
}

interface ChangeCardProps {
  commitId: CommitId;
  commit: Commit;
  stats: CommitStats | undefined;
  draggedCommitId: CommitId | null;
  hoveredCommitId: CommitId | null;
  isDraggingFile: boolean;
  isInParallelGroup: boolean;
  isSelected: boolean;
  isCurrent: boolean;
  isDivergent: boolean;
  isEmpty: boolean;
  bookmarks: BookmarkName[];
  onCommitSelect: (commitId: CommitId) => void;
  setHoveredCommitId: HoverStateUpdater;
  setIsDraggingFile: (value: boolean) => void;
  setDraggedCommitId: (commitId: CommitId | null) => void;
}

export function ChangeCard({
  commitId,
  commit,
  stats,
  draggedCommitId,
  hoveredCommitId,
  isDraggingFile,
  isInParallelGroup,
  isSelected,
  isCurrent,
  isDivergent,
  isEmpty,
  bookmarks,
  onCommitSelect,
  setHoveredCommitId,
  setIsDraggingFile,
  setDraggedCommitId,
}: ChangeCardProps) {
  const { handleFileDrop, handleCommitDrop, handleBookmarkDrop } = useDragDrop();

  const isHovered = hoveredCommitId === commitId;
  const isBeingDragged = draggedCommitId === commitId;
  const isCommitDragActive = draggedCommitId !== null;
  const isOtherCommitBeingDragged = isCommitDragActive && !isBeingDragged;
  const isFileDragActive = isDraggingFile && !isCommitDragActive;
  const isFileDropTarget = isFileDragActive && !isHovered;

  const sizeIndicator = useMemo(() => getCommitSizeIndicator(stats), [stats]);

  const handleDragStart = (event: React.DragEvent) => {
    event.stopPropagation();
    setDraggedCommitId(commitId);
    const changeId = commit.changeId as ChangeId;
    dragChange(event, { source: 'change', changeId, commitId });
  };

  const handleDragEnd = () => {
    setDraggedCommitId(null);
    setHoveredCommitId(null);
    setIsDraggingFile(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    if (isSelected) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    setHoveredCommitId(null);
    setIsDraggingFile(false);

    const fileChange = draggedFileChange(event);
    const change = draggedChange(event);
    const bookmark = draggedBookmark(event);

    if (fileChange) {
      handleFileDrop({ kind: 'existing', commit: commitId }, fileChange);
      return;
    }

    if (bookmark) {
      handleBookmarkDrop({ kind: 'existing', commit: commitId }, bookmark);
      return;
    }

    if (change) {
      handleCommitDrop({ kind: 'existing', commit: commitId }, change, { mode: 'squash' });
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    if (isSelected) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (event: React.DragEvent) => {
    if (isSelected) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setHoveredCommitId(commitId);
    if (event.dataTransfer.types.includes('application/json')) {
      setIsDraggingFile(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent) => {
    if (isSelected) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const nextTarget = event.relatedTarget as Node | null;
    if (!event.currentTarget.contains(nextTarget)) {
      setHoveredCommitId(null);
    }
  };

  const handleClick = () => {
    onCommitSelect(commitId);
  };

  const commitTimestamp = commit.timestamp.toLocaleDateString();

  return (
    <div style={{ position: 'relative' }}>
      <div
        draggable
        className={styles.commitCard}
        data-drop-kind="commit"
        data-commit={commitId}
        data-selected={isSelected ? 'true' : 'false'}
        data-current={isCurrent ? 'true' : 'false'}
        data-being-dragged={isBeingDragged ? 'true' : 'false'}
        data-hovered={isHovered && !isSelected ? 'true' : 'false'}
        data-commit-dragging={isOtherCommitBeingDragged ? 'true' : 'false'}
        data-file-dragging={isFileDragActive ? 'true' : 'false'}
        data-commit-drop-target={isOtherCommitBeingDragged && !isHovered ? 'true' : 'false'}
        data-file-drag-target={isFileDropTarget ? 'true' : 'false'}
        data-parallel={isInParallelGroup ? 'true' : 'false'}
        data-conflict={commit.hasConflicts ? 'true' : 'false'}
        data-divergent={isDivergent ? 'true' : 'false'}
        data-empty={isEmpty ? 'true' : 'false'}
        style={{ marginBottom: 0 }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
      >
        <div style={{ fontSize: '10px', fontFamily: 'monospace', color: '#6b7280', display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ fontWeight: 600, color: '#374151' }}>
                change: {commit.changeId.slice(0, 8)}
              </div>
              {isCurrent && (
                <span
                  style={{
                    fontSize: '9px',
                    fontWeight: 600,
                    color: '#047857',
                    border: '1px solid #34d399',
                    borderRadius: '3px',
                    padding: '1px 4px',
                    background: '#d1fae5',
                    textTransform: 'uppercase',
                  }}
                >
                  current
                </span>
              )}
              {commit.hasConflicts && (
                <span
                  style={{
                    fontSize: '9px',
                    fontWeight: 600,
                    color: '#b91c1c',
                    border: '1px solid #fca5a5',
                    borderRadius: '3px',
                    padding: '1px 4px',
                    background: '#fef2f2',
                    textTransform: 'uppercase',
                  }}
                >
                  conflict
                </span>
              )}
              {isDivergent && (
                <span
                  style={{
                    fontSize: '9px',
                    fontWeight: 600,
                    color: '#5b21b6',
                    border: '1px solid #c4b5fd',
                    borderRadius: '3px',
                    padding: '1px 4px',
                    background: '#ede9fe',
                    textTransform: 'uppercase',
                  }}
                >
                  divergent
                </span>
              )}
            </div>
            {sizeIndicator && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div
                  style={{
                    fontSize: '9px',
                    fontWeight: 'bold',
                    padding: '1px 5px',
                    borderRadius: '3px',
                    background: sizeIndicator.color,
                    color: 'white',
                  }}
                  title={sizeIndicator.tooltip}
                >
                  {sizeIndicator.label}
                </div>
              </div>
            )}
          </div>
          {bookmarks.length > 0 && (
            <div className={styles.bookmarkList}>
              {bookmarks.map((bookmarkName) => {
                const badgeLabel = bookmarkName as unknown as string;
                const synthetic = isSyntheticBookmark(bookmarkName);
                return (
                  <span
                    key={badgeLabel}
                    className={styles.bookmarkBadge}
                    draggable={!synthetic}
                    onDragStart={!synthetic ? (bookmarkDragEvent: React.DragEvent) => {
                      bookmarkDragEvent.stopPropagation();
                      dragBookmark(bookmarkDragEvent, { source: 'bookmark', bookmarkName });
                    } : undefined}
                  >
                    <span aria-hidden="true">🔖</span>
                    {badgeLabel}
                  </span>
                );
              })}
            </div>
          )}
          {isDivergent && (
            <div style={{ fontSize: '9px', color: '#9ca3af' }}>
              commit: {commitId.slice(0, 8)}
            </div>
          )}
        </div>
        <div
          style={{
            fontSize: '14px',
            fontWeight: 500,
            margin: '4px 0',
            color: '#111827',
            wordWrap: 'break-word',
            lineHeight: '1.2',
          }}
        >
          {commit.description}
        </div>
        <div style={{ fontSize: '11px', color: '#6b7280' }}>
          {commit.author.name} • {commitTimestamp}
        </div>
      </div>
      <BranchDropZone commitId={commitId} />
    </div>
  );
}

function BranchDropZone({ commitId }: { commitId: CommitId }) {
  const { handleFileDrop, handleCommitDrop } = useDragDrop();
  const [isOver, setIsOver] = useState(false);
  const createNewChange = useGraphStore(state => state.createNewChange);
  const isExecutingCommand = useGraphStore(state => state.isExecutingCommand);

  const metadata: Record<string, string> = {
    'data-drop-kind': 'new-branch',
    'data-from-commit': commitId,
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsOver(false);

    const fileChange = draggedFileChange(event);
    const change = draggedChange(event);

    if (fileChange) {
      handleFileDrop({ kind: 'new-branch', commit: commitId }, fileChange);
      return;
    }

    if (change) {
      handleCommitDrop({ kind: 'new-branch', commit: commitId }, change);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (event: React.DragEvent) => {
    event.preventDefault();
    setIsOver(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (!event.currentTarget.contains(nextTarget)) {
      setIsOver(false);
    }
  };

  const handleCreateEmptyBranch = () => {
    if (isExecutingCommand) {
      return;
    }
    void createNewChange([], { type: 'new-branch', fromCommitId: commitId });
  };

  return (
    <div
      className={styles.dropZoneBranch}
      {...metadata}
      data-over={isOver ? 'true' : 'false'}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        handleCreateEmptyBranch();
      }}
      title="Drop to split into a new branch. Click to create an empty change here."
    >
      🌿
    </div>
  );
}

