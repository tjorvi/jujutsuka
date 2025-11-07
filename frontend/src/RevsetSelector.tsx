import { useMemo, type CSSProperties } from 'react';
import { useGraphStore } from './graphStore';
import { revsetPresets, type RevsetPresetName } from './revsetConfig';

const presetOrder: RevsetPresetName[] = ['rootAncestors', 'mainAncestors'];

function buttonStyle(selected: boolean): CSSProperties {
  return {
    padding: '4px 10px',
    borderRadius: '999px',
    border: selected ? '1px solid #3b82f6' : '1px solid #d1d5db',
    backgroundColor: selected ? '#dbeafe' : '#f9fafb',
    color: selected ? '#1d4ed8' : '#374151',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background-color 0.1s ease-in-out, border 0.1s ease-in-out',
  };
}

export function RevsetSelector() {
  const revsetSelection = useGraphStore(state => state.revsetSelection);
  const customRevset = useGraphStore(state => state.customRevset);
  const setRevsetPreset = useGraphStore(state => state.setRevsetPreset);
  const selectCustomRevset = useGraphStore(state => state.selectCustomRevset);
  const setCustomRevsetValue = useGraphStore(state => state.setCustomRevsetValue);

  const activeExpression = useMemo(() => {
    if (revsetSelection.kind === 'preset') {
      const preset = revsetPresets[revsetSelection.preset];
      return preset.label;
    }
    return customRevset;
  }, [revsetSelection, customRevset]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '13px', color: '#6b7280' }}>Revset:</span>
        {presetOrder.map((presetName) => {
          const preset = revsetPresets[presetName];
          const selected = revsetSelection.kind === 'preset' && revsetSelection.preset === presetName;
          return (
            <button
              key={presetName}
              type="button"
              aria-pressed={selected}
              onClick={() => setRevsetPreset(presetName)}
              style={buttonStyle(selected)}
            >
              {preset.label}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={revsetSelection.kind === 'custom'}
          onClick={selectCustomRevset}
          style={buttonStyle(revsetSelection.kind === 'custom')}
        >
          Custom
        </button>
      </div>
      {revsetSelection.kind === 'custom' ? (
        <input
          type="text"
          value={customRevset}
          onChange={(event) => setCustomRevsetValue(event.target.value)}
          placeholder="Enter any revset expression (e.g. all() ~ bookmarks())"
          style={{
            width: '100%',
            padding: '6px 10px',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '13px',
            backgroundColor: '#ffffff',
            color: '#111827',
          }}
        />
      ) : (
        <div style={{ fontSize: '12px', color: '#6b7280' }}>
          Active revset: <code style={{ backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '4px' }}>{activeExpression}</code>
        </div>
      )}
    </div>
  );
}
