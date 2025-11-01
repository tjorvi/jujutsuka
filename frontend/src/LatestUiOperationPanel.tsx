import type { OpLogEntry } from "../../backend/src/repo-parser";
import type { UiOperationLogEntry } from "./graphStore";

interface LatestUiOperationPanelProps {
  readonly latestUiOperation: UiOperationLogEntry;
  readonly operationsAfter: readonly OpLogEntry[];
  readonly humanizeTime: (timestamp: string) => string;
  readonly shortenOpDescription: (description: string) => string;
  readonly isExpanded: boolean;
  readonly onToggle: () => void;
}

const statusStyles: Record<UiOperationLogEntry['status'], { readonly border: string; readonly background: string; readonly label: string; readonly text: string }> = {
  triggered: { border: '#d1d5db', background: '#f9fafb', label: 'Triggered', text: '#374151' },
  succeeded: { border: '#22c55e', background: '#dcfce7', label: 'Success', text: '#166534' },
  failed: { border: '#ef4444', background: '#fee2e2', label: 'Failure', text: '#991b1b' },
};

function assertNever(value: never): never {
  throw new Error(`Unhandled UI operation kind: ${JSON.stringify(value)}`);
}

function describeKind(kind: UiOperationLogEntry['kind']): string {
  switch (kind.type) {
    case 'intention-command':
      return `Command: ${kind.command.type}`;
    case 'legacy-command':
      return `Legacy command: ${kind.command.type}`;
    case 'button':
      return `Button: ${kind.button}`;
    default:
      return assertNever(kind);
  }
}

export function LatestUiOperationPanel({
  latestUiOperation,
  operationsAfter,
  humanizeTime,
  shortenOpDescription,
  isExpanded,
  onToggle,
}: LatestUiOperationPanelProps) {
  const statusStyle = statusStyles[latestUiOperation.status];
  const operationsSummary = operationsAfter.length === 0
    ? 'No repo ops yet'
    : `${operationsAfter.length} repo op${operationsAfter.length === 1 ? '' : 's'} after`;

  return (
    <div
      style={{
        position: 'fixed',
        right: '24px',
        bottom: '24px',
        zIndex: 20,
        width: isExpanded ? '340px' : '280px',
        maxHeight: '70vh',
        boxShadow: '0 10px 30px rgba(15, 23, 42, 0.18)',
        borderRadius: '10px',
        overflow: 'hidden',
        border: `1px solid ${statusStyle.border}`,
        background: '#ffffff',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '12px 16px',
          background: statusStyle.background,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: statusStyle.text,
              }}
            />
            <span style={{ fontSize: '13px', fontWeight: 600, color: statusStyle.text }}>
              {statusStyle.label}
            </span>
            <span style={{ fontSize: '12px', color: '#6b7280' }}>
              {humanizeTime(latestUiOperation.timestamp)}
            </span>
          </div>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: '#111827',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: isExpanded ? 'normal' : 'nowrap',
            }}
            title={latestUiOperation.description}
          >
            {latestUiOperation.description}
          </div>
        </div>
        <button
          onClick={onToggle}
          style={{
            border: 'none',
            background: '#111827',
            color: '#ffffff',
            borderRadius: '999px',
            padding: '4px 10px',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          {isExpanded ? 'Hide' : 'Details'}
        </button>
      </div>

      <div style={{ padding: '10px 16px', background: '#ffffff', fontSize: '12px', color: '#4b5563', borderTop: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div>
            {describeKind(latestUiOperation.kind)} · {operationsSummary}
          </div>
          {latestUiOperation.errorMessage && (
            <div style={{ color: '#b91c1c' }}>
              Error: {latestUiOperation.errorMessage}
            </div>
          )}
          {latestUiOperation.opLogHeadAtCreation && (
            <div style={{ color: '#6b7280' }}>
              Op head recorded as {latestUiOperation.opLogHeadAtCreation.slice(0, 12)}
            </div>
          )}
        </div>
      </div>

      {isExpanded && (
        <div style={{ borderTop: '1px solid #e5e7eb', background: '#f9fafb', padding: '12px 16px', maxHeight: '220px', overflowY: 'auto' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>
            Repository operations after this UI action
          </div>
          {operationsAfter.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#6b7280' }}>
              No repository operations recorded after this UI action yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {operationsAfter.map((entry) => (
                <div
                  key={entry.operationId}
                  style={{
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    padding: '10px 12px',
                    background: '#ffffff',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#374151' }}>
                      {entry.operationId}
                    </span>
                    <span style={{ fontSize: '11px', color: '#6b7280' }}>
                      {humanizeTime(entry.timestamp)}
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#1f2937' }}>
                    {shortenOpDescription(entry.operationDescription)}
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>
                    User: {entry.user}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
