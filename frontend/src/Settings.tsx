import { useState, useEffect } from 'react';
import { saveAPIKey, loadAPIKey, clearAPIKey, saveModel, loadModel } from './llmService';

interface SettingsProps {
  onClose: () => void;
}

export function Settings({ onClose }: SettingsProps) {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-5-nano');
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    const stored = loadAPIKey();
    if (stored) {
      setApiKey(stored);
    }
    const storedModel = loadModel();
    if (storedModel) {
      setModel(storedModel);
    }
  }, []);

  const handleSave = () => {
    if (apiKey.trim()) {
      saveAPIKey(apiKey.trim());
      saveModel(model);
      alert('Settings saved!');
    }
  };

  const handleClear = () => {
    if (confirm('Clear API key from storage?')) {
      clearAPIKey();
      setApiKey('');
      alert('API key cleared!');
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: '8px',
        minWidth: '400px',
        maxWidth: '500px',
      }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>⚙️ Settings</h2>
        
        <div style={{ marginBottom: '16px' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '6px', 
            fontSize: '14px',
            fontWeight: '500',
          }}>
            OpenAI API Key
          </label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              style={{
                flex: 1,
                padding: '8px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '14px',
                fontFamily: 'monospace',
              }}
            />
            <button
              onClick={() => setShowKey(!showKey)}
              style={{
                padding: '8px 12px',
                background: '#f3f4f6',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              {showKey ? '🙈' : '👁️'}
            </button>
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
            Stored locally in your browser
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '6px', 
            fontSize: '14px',
            fontWeight: '500',
          }}>
            Model
          </label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              fontSize: '14px',
              fontFamily: 'monospace',
            }}
          >
            <option value="gpt-5">gpt-5 (latest, most capable)</option>
            <option value="gpt-5-mini">gpt-5-mini (fast & efficient)</option>
            <option value="gpt-5-nano">gpt-5-nano (recommended - fastest & cheapest)</option>
            <option value="gpt-4.1">gpt-4.1</option>
            <option value="gpt-4o-mini">gpt-4o-mini</option>
            <option value="gpt-4o">gpt-4o</option>
            <option value="o4-mini">o4-mini (reasoning, cheaper)</option>
            <option value="o3">o3 (reasoning)</option>
            <option value="gpt-4-turbo">gpt-4-turbo (legacy)</option>
            <option value="gpt-4">gpt-4 (legacy)</option>
            <option value="gpt-3.5-turbo">gpt-3.5-turbo (legacy)</option>
          </select>
        </div>

        <div style={{ 
          display: 'flex', 
          gap: '8px', 
          justifyContent: 'flex-end',
          marginTop: '24px',
        }}>
          <button
            onClick={handleClear}
            style={{
              padding: '8px 16px',
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Clear
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '8px 16px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
