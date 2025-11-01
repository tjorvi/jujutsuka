import { useEffect, useMemo, useState } from 'react';
import type { ChangeId, CommitId, Commit } from '../../backend/src/repo-parser';
import type { Stack } from './stackUtils';
import { draggedFileChange, draggedChange, draggedHunk, useDragDrop, type DropZonePosition } from './useDragDrop';
import { queries } from './api';
import { useGraphStore } from './graphStore';
import styles from './StackGraph.module.css';
import { ChangeCard } from './ChangeCard';
import { match } from 'ts-pattern';

interface StackComponentProps {
  stack: Stack;
  commitGraph: Record<CommitId, { commit: Commit; children: CommitId[] }>;
  isInParallelGroup?: boolean;
  selectedCommitId?: CommitId;
  currentCommitId?: CommitId;
  divergentChangeIds: ReadonlySet<ChangeId>;
  onCommitSelect: (commitId: CommitId) => void;
}

interface DropZoneProps {
  position: DropZonePosition;
  children?: React.ReactNode;
}

const shortCommitId = (commitId: CommitId): string =>
  commitId.length <= 8 ? commitId : commitId.slice(0, 8);

function DropZone({ position, children }: DropZoneProps) {
  const { handleFileDrop, handleCommitDrop, handleHunkDrop } = useDragDrop();
  const [isOver, setIsOver] = useState(false);
  const createNewChange = useGraphStore(state => state.createNewChange);
  const isExecutingCommand = useGraphStore(state => state.isExecutingCommand);
  const dropLabel = match(position)
    .with({ kind: 'between-commits' }, between => `after ${shortCommitId(between.afterCommit)} and before ${shortCommitId(between.beforeCommit)}`)
    .with({ kind: 'before' }, before => `before ${shortCommitId(before.commit)}`)
    .with({ kind: 'after' }, after => `after ${shortCommitId(after.commit)}`)
    .with({ kind: 'existing-commit' }, existing => `into existing commit ${shortCommitId(existing.commit)}`)
    .with({ kind: 'new-branch' }, newBranch => `as new branch from ${shortCommitId(newBranch.commit)}`)
    .exhaustive();

  const dropTitle = `Drop to move ${dropLabel}`;
  const canCreateEmptyChange = position.kind !== 'existing-commit';

  const dropMetadata: Record<string, string> = {
    'data-drop-kind': position.kind,
  };

  if (position.kind === 'between-commits') {
    dropMetadata['data-before-commit'] = position.beforeCommit;
    dropMetadata['data-after-commit'] = position.afterCommit;
  } else if (position.kind === 'before' || position.kind === 'after' || position.kind === 'existing-commit') {
    dropMetadata['data-commit'] = position.commit;
  }

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsOver(false);

    const fileChange = draggedFileChange(event);
    const change = draggedChange(event);
    const hunk = draggedHunk(event);

    if (fileChange) {
      handleFileDrop(position, fileChange);
      return;
    }

    if (hunk) {
      handleHunkDrop(position, hunk);
      return;
    }

    if (change) {
      handleCommitDrop(position, change);
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

  const handleCreateEmptyChange = () => {
    if (!canCreateEmptyChange) {
      return;
    }
    void createNewChange([], position);
  };

  const dropZoneLine = (
    <div className={styles.dropZoneWrapper}>
      <div
        className={styles.dropZoneLinear}
        {...dropMetadata}
        data-over={isOver ? 'true' : 'false'}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        title={dropTitle}
      />
      {canCreateEmptyChange && (
        <button
          type="button"
          className={styles.dropZoneAction}
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            handleCreateEmptyChange();
          }}
          disabled={isExecutingCommand}
        >
          New change
        </button>
      )}
    </div>
  );

  return (
    <>
      {position.kind === 'before' && dropZoneLine}
      {children}
      {(position.kind === 'after' || position.kind === 'between-commits') && dropZoneLine}
    </>
  );
}

export function StackComponent({
  stack,
  commitGraph,
  isInParallelGroup = false,
  selectedCommitId,
  currentCommitId,
  divergentChangeIds,
  onCommitSelect,
}: StackComponentProps) {
  const [commitStats, setCommitStats] = useState<Record<CommitId, { additions: number; deletions: number }>>({});
  const repoPath = useGraphStore(state => state.repoPath);
  const bookmarksByCommit = useGraphStore(state => state.bookmarksByCommit);

  const commitsInDisplayOrder = useMemo(() => stack.commits.slice().reverse(), [stack.commits]);

  useEffect(() => {
    if (!repoPath) {
      return;
    }

    const fetchStats = async () => {
      const stats: Record<CommitId, { additions: number; deletions: number }> = {};
      for (const commitId of stack.commits) {
        const result = await queries.commitStats.query({ repoPath, commitId });
        stats[commitId] = result;
      }
      setCommitStats(stats);
    };

    void fetchStats();
  }, [stack.commits, repoPath]);

  useEffect(() => {
    if (stack.commits.length === 0) {
      return;
    }
    const firstCommitId = stack.commits[0];
    const commitData = commitGraph[firstCommitId];
    if (!commitData) {
      return;
    }
    console.log('🐛 DEBUG commit data:', {
      id: firstCommitId,
      changeId: commitData.commit.changeId,
      description: commitData.commit.description,
      author: commitData.commit.author.name,
      timestamp: commitData.commit.timestamp,
    });
  }, [stack.commits, commitGraph]);

  return (
    <div
      className={styles.stackContainer}
      data-parallel={isInParallelGroup ? 'true' : 'false'}
    >
      <div
        style={{
          fontSize: '12px',
          fontWeight: 'bold',
          marginBottom: '8px',
          color: isInParallelGroup ? '#7c3aed' : '#6b7280',
        }}
      >
        {stack.commits.length} commit{stack.commits.length > 1 ? 's' : ''}
      </div>

      {commitsInDisplayOrder[0] && (
        <DropZone position={{ kind: 'after', commit: commitsInDisplayOrder[0] }} />
      )}

      {commitsInDisplayOrder.map((commitId, index) => {
        const commit = commitGraph[commitId]?.commit;
        if (!commit) {
          return null;
        }

        const isSelected = selectedCommitId === commitId;
        const isCurrent = currentCommitId === commitId;
        const isDivergent = divergentChangeIds.has(commit.changeId);
        const nextCommitId = commitsInDisplayOrder[index + 1];
        const stats = commitStats[commitId];
        const isEmpty = (!stats || (stats.additions === 0 && stats.deletions === 0)) &&
          (commit.description === '' || commit.description === '(no description)');
        const commitBookmarks = bookmarksByCommit[commitId] ?? [];

        console.log('Commit', commitId.slice(0, 8), {
          description: commit.description,
          stats,
          isEmpty,
          hasStats: !!stats,
          additions: stats?.additions,
          deletions: stats?.deletions,
          bookmarks: commitBookmarks,
        });

        return (
          <div key={commitId} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <ChangeCard
              commitId={commitId}
              commit={commit}
              stats={stats}
              isInParallelGroup={isInParallelGroup}
              isSelected={isSelected}
              isCurrent={isCurrent}
              isDivergent={isDivergent}
              isEmpty={isEmpty}
              bookmarks={commitBookmarks}
              onCommitSelect={onCommitSelect}
            />
            <DropZone
              position={
                nextCommitId
                  ? { kind: 'between-commits', beforeCommit: commitId, afterCommit: nextCommitId }
                  : { kind: 'before', commit: commitId }
              }
            />
          </div>
        );
      })}
    </div>
  );
}
