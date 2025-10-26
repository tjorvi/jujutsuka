import { useState, useMemo } from 'react';

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
}

export function DiffHunk({ header, lines, defaultExpanded = true }: DiffHunkProps) {
  const [isOpen, setIsOpen] = useState(defaultExpanded);

  const renderedLines = useMemo(
    () => lines.map((line, index) => (
      <DiffLine key={`line-${index}`} line={line} />
    )),
    [lines],
  );

  return (
    <div
      style={{
        border: '1px solid #3e3e3e',
        borderRadius: '4px',
        marginBottom: '12px',
        overflow: 'hidden',
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
          padding: '8px 12px',
          background: '#2d3748',
          color: '#e5e7eb',
          borderBottom: isOpen && lines.length > 0 ? '1px solid #3e3e3e' : 'none',
          fontFamily: 'monospace',
          fontSize: '12px',
        }}
      >
        <span aria-hidden="true" style={{ fontSize: '12px', color: '#9ca3af' }}>
          {isOpen ? '▼' : '▶'}
        </span>
        <span>{header}</span>
      </button>
      {isOpen && (
        <div
          style={{
            background: '#0d1117',
            paddingTop: '8px',
            paddingBottom: '8px',
          }}
        >
          {renderedLines}
        </div>
      )}
    </div>
  );
}
