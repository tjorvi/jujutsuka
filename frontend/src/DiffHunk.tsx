import { useState, useMemo, useCallback } from 'react';

interface DiffLineStyle {
  readonly color: string;
  readonly backgroundColor: string;
}

const baseLineStyle: DiffLineStyle = {
  color: '#e5e7eb',
  backgroundColor: 'transparent',
};

const additionLineStyle: DiffLineStyle = {
  color: '#22c55e',
  backgroundColor: '#052e16',
};

const deletionLineStyle: DiffLineStyle = {
  color: '#ef4444',
  backgroundColor: '#450a0a',
};

const headerLineStyle: DiffLineStyle = {
  color: '#3b82f6',
  backgroundColor: '#172554',
};

const metadataLineStyle: DiffLineStyle = {
  color: '#9ca3af',
  backgroundColor: 'transparent',
};

function diffLineStyleFor(line: string): DiffLineStyle {
  if (line.startsWith('@@')) {
    return headerLineStyle;
  }
  if (line.startsWith('+') && !line.startsWith('+++')) {
    return additionLineStyle;
  }
  if (line.startsWith('-') && !line.startsWith('---')) {
    return deletionLineStyle;
  }
  if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
    return metadataLineStyle;
  }
  return baseLineStyle;
}

interface DiffLineProps {
  readonly line: string;
}

export function DiffLine({ line }: DiffLineProps) {
  const style = diffLineStyleFor(line);

  return (
    <div
      style={{
        color: style.color,
        backgroundColor: style.backgroundColor,
        paddingLeft: '8px',
        paddingRight: '8px',
        fontFamily: 'monospace',
        fontSize: '13px',
        lineHeight: '1.4',
        whiteSpace: 'pre',
      }}
    >
      {line || ' '}
    </div>
  );
}

interface DiffHunkProps {
  readonly header: string;
  readonly lines: readonly string[];
  readonly defaultExpanded?: boolean;
  readonly onExplain?: (input: { readonly header: string; readonly lines: readonly string[] }) => Promise<string>;
}

type ExplanationState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly content: string }
  | { readonly status: 'error'; readonly message: string };

const idleExplanation: ExplanationState = { status: 'idle' };

export function DiffHunk({ header, lines, defaultExpanded = true, onExplain }: DiffHunkProps) {
  const [isOpen, setIsOpen] = useState(defaultExpanded);
  const [explanation, setExplanation] = useState<ExplanationState>(idleExplanation);

  const renderedLines = useMemo(
    () => lines.map((line, index) => (
      <DiffLine key={`line-${index}`} line={line} />
    )),
    [lines],
  );

  const isExplaining = explanation.status === 'loading';

  const handleExplain = useCallback(async () => {
    if (!onExplain || isExplaining) {
      return;
    }

    setExplanation({ status: 'loading' });
    try {
      const content = await onExplain({ header, lines });
      setExplanation({ status: 'success', content });
      setIsOpen(true);
    } catch (error) {
      setExplanation({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to explain diff hunk',
      });
      setIsOpen(true);
    }
  }, [onExplain, isExplaining, header, lines]);

  return (
    <div
      style={{
        border: '1px solid #3e3e3e',
        borderRadius: '4px',
        marginBottom: '12px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: '#2d3748',
          color: '#e5e7eb',
          borderBottom: isOpen && lines.length > 0 ? '1px solid #3e3e3e' : 'none',
        }}
      >
        <button
          type="button"
          aria-expanded={isOpen}
          aria-label="Toggle hunk visibility"
          onClick={() => setIsOpen(prev => !prev)}
          style={{
            all: 'unset',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flex: 1,
            color: '#e5e7eb',
            fontFamily: 'monospace',
            fontSize: '12px',
          }}
        >
          <span aria-hidden="true" style={{ fontSize: '12px', color: '#9ca3af' }}>
            {isOpen ? '▼' : '▶'}
          </span>
          <span>{header}</span>
        </button>
        {onExplain && (
          <button
            type="button"
            onClick={() => {
              void handleExplain();
            }}
            disabled={isExplaining}
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid #3e3e3e',
              background: isExplaining ? '#1f2937' : '#111827',
              color: isExplaining ? '#9ca3af' : '#e5e7eb',
              fontSize: '11px',
              cursor: isExplaining ? 'wait' : 'pointer',
            }}
          >
            {isExplaining ? 'Explaining…' : 'Explain change'}
          </button>
        )}
      </div>
      {isOpen && (
        <div
          style={{
            background: '#0d1117',
            paddingTop: '8px',
            paddingBottom: '8px',
          }}
        >
          {renderedLines}
          {explanation.status === 'loading' && (
            <div
              style={{
                margin: '8px',
                padding: '8px',
                borderRadius: '4px',
                background: '#1f2937',
                color: '#9ca3af',
                fontFamily: 'monospace',
                fontSize: '12px',
              }}
            >
              Generating explanation…
            </div>
          )}
          {explanation.status === 'success' && (
            <div
              style={{
                margin: '8px',
                padding: '8px',
                borderRadius: '4px',
                background: '#111827',
                color: '#e5e7eb',
                fontSize: '12px',
                lineHeight: '1.5',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {explanation.content}
            </div>
          )}
          {explanation.status === 'error' && (
            <div
              style={{
                margin: '8px',
                padding: '8px',
                borderRadius: '4px',
                background: '#451a0a',
                color: '#fecaca',
                fontFamily: 'monospace',
                fontSize: '12px',
              }}
            >
              Failed to explain: {explanation.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
