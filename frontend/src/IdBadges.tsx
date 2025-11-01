import { useCallback, useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { ChangeId, CommitId } from '../../backend/src/repo-parser';
import { useGraphStore } from './graphStore';

const baseStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '2px 6px',
  borderRadius: '999px',
  fontFamily: 'monospace',
  fontSize: '11px',
  fontWeight: 600,
  cursor: 'pointer',
  userSelect: 'none',
  whiteSpace: 'nowrap',
  borderWidth: '1px',
  borderStyle: 'solid',
};

const commitStyle: CSSProperties = {
  ...baseStyle,
  background: '#e0f2fe',
  color: '#0369a1',
  borderColor: '#7dd3fc',
};

const changeStyle: CSSProperties = {
  ...baseStyle,
  background: '#ede9fe',
  color: '#5b21b6',
  borderColor: '#c4b5fd',
};

const combinedWrapperStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '0 4px',
  borderRadius: '999px',
  background: '#f8fafc',
};

const badgeRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  flexWrap: 'wrap',
};

const badgeLabelStyle: CSSProperties = {
  fontSize: '11px',
  color: '#4b5563',
  fontWeight: 500,
};

function useHoverHandlers(commitIds: readonly CommitId[], changeIds: readonly ChangeId[]) {
  const setHoverTargets = useGraphStore(state => state.setHoverTargets);
  const clearHoverTargets = useGraphStore(state => state.clearHoverTargets);

  const commits = useMemo(() => Array.from(commitIds), [commitIds]);
  const changes = useMemo(() => Array.from(changeIds), [changeIds]);

  const onEnter = useCallback(() => {
    setHoverTargets(commits, changes);
  }, [setHoverTargets, commits, changes]);

  const onLeave = useCallback(() => {
    clearHoverTargets();
  }, [clearHoverTargets]);

  return { onEnter, onLeave };
}

interface CommitIdTokenProps {
  readonly commitId: CommitId;
  readonly label?: string;
  readonly interactive?: boolean;
}

export function CommitIdToken({ commitId, label, interactive = true }: CommitIdTokenProps) {
  const { onEnter, onLeave } = useHoverHandlers([commitId], []);
  const handlers = interactive
    ? {
        onMouseEnter: onEnter,
        onMouseLeave: onLeave,
        onFocus: onEnter,
        onBlur: onLeave,
      }
    : {};

  return (
    <span
      style={commitStyle}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      title={`Commit ${commitId}`}
      {...handlers}
    >
      {label ?? commitId.slice(0, 8)}
    </span>
  );
}

interface ChangeIdTokenProps {
  readonly changeId: ChangeId;
  readonly label?: string;
  readonly interactive?: boolean;
}

export function ChangeIdToken({ changeId, label, interactive = true }: ChangeIdTokenProps) {
  const { onEnter, onLeave } = useHoverHandlers([], [changeId]);
  const handlers = interactive
    ? {
        onMouseEnter: onEnter,
        onMouseLeave: onLeave,
        onFocus: onEnter,
        onBlur: onLeave,
      }
    : {};

  return (
    <span
      style={changeStyle}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      title={`Change ${changeId}`}
      {...handlers}
    >
      {label ?? changeId.slice(0, 8)}
    </span>
  );
}

interface CommitChangeTokenProps {
  readonly commitId: CommitId;
  readonly changeId?: ChangeId | null;
}

export function CommitChangeToken({ commitId, changeId: changeIdProp }: CommitChangeTokenProps) {
  const commitGraph = useGraphStore(state => state.commitGraph);
  const resolvedChangeId = changeIdProp ?? commitGraph?.[commitId]?.commit.changeId;
  const changeIdsArray = resolvedChangeId ? [resolvedChangeId] : [];
  const { onEnter, onLeave } = useHoverHandlers([commitId], changeIdsArray);

  return (
    <span
      style={combinedWrapperStyle}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      role="button"
      tabIndex={0}
      title={resolvedChangeId ? `Commit ${commitId} · Change ${resolvedChangeId}` : `Commit ${commitId}`}
    >
      <span style={{ fontSize: '10px', color: '#6b7280' }}>commit</span>
      <CommitIdToken commitId={commitId} interactive={false} />
      {resolvedChangeId ? (
        <>
          <span style={{ fontSize: '10px', color: '#6b7280' }}>change</span>
          <ChangeIdToken changeId={resolvedChangeId} interactive={false} />
        </>
      ) : null}
    </span>
  );
}

interface IdBadgeGroupProps {
  readonly commitIds?: readonly CommitId[];
  readonly changeIds?: readonly ChangeId[];
  readonly style?: CSSProperties;
}

export function IdBadgeGroup({ commitIds = [], changeIds = [], style }: IdBadgeGroupProps) {
  const hasCommitIds = commitIds.length > 0;
  const hasChangeIds = changeIds.length > 0;
  if (!hasCommitIds && !hasChangeIds) {
    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', ...(style ?? {}) }}>
      {hasCommitIds && (
        <div style={badgeRowStyle}>
          <span style={badgeLabelStyle}>Commits:</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {commitIds.map((commitId) => (
              <CommitIdToken key={commitId} commitId={commitId} />
            ))}
          </div>
        </div>
      )}
      {hasChangeIds && (
        <div style={badgeRowStyle}>
          <span style={badgeLabelStyle}>Changes:</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {changeIds.map((changeId) => (
              <ChangeIdToken key={changeId} changeId={changeId} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
