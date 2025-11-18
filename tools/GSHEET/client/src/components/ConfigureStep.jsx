import React, { useState } from 'react';
import axios from '../config/axios';

export default function ConfigureStep({ processedCompanies, onConfigured, onBack }) {
  const [updateMode, setUpdateMode] = useState('Replace');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleNext = async () => {
    setLoading(true);
    setError('');
    try {
      await axios.post('/api/configure', { updateMode });
      onConfigured({ processedCompanies, updateMode });
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  const totalRows = Object.values(processedCompanies).reduce((sum, data) => sum + (data.rowCount || 0), 0);

  return (
    <div className="shad-card">
      <h2>Step 5: Choose Update Mode</h2>
      <p>Pick how you'd like to sync the cleaned data back into Google Sheets.</p>

      <div className="radio-group">
        <label>
          <input
            type="radio"
            checked={updateMode === 'Replace'}
            onChange={() => setUpdateMode('Replace')}
          />
          Replace existing data
        </label>
        <label>
          <input
            type="radio"
            checked={updateMode === 'Append'}
            onChange={() => setUpdateMode('Append')}
          />
          Append to existing data
        </label>
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '-0.5rem' }}>
        Replace: Clear old data (keep headers) | Append: Keep old data, add new below
      </p>

      <hr />

      <div className="summary">
        <h3>Summary</h3>
        <div className="metrics" style={{ marginTop: '1rem' }}>
          <div>
            <strong>Companies</strong>
            <div>{Object.keys(processedCompanies).length}</div>
          </div>
          <div>
            <strong>Tabs</strong>
            <div>{Object.keys(processedCompanies).length}</div>
          </div>
          <div>
            <strong>Total Rows</strong>
            <div>{totalRows}</div>
          </div>
        </div>
        <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(8, 12, 24, 0.5)', borderRadius: '0.75rem' }}>
          <strong>Update Mode:</strong> {updateMode === 'Replace' ? 'Replace existing data' : 'Append to existing data'}
        </div>
      </div>

      <div className="tab-operations">
        <h3>Tab Operations:</h3>
        {Object.entries(processedCompanies).map(([company, data]) => (
          <div key={company} style={{ marginTop: '0.75rem' }}>
            {data.oldTabName && data.oldTabName !== data.tabName ? (
              <div>
                • <strong>{company}</strong>: Rename <code>{data.oldTabName}</code> → <code>{data.tabName}</code> ({data.rowCount} rows)
              </div>
            ) : (
              <div>
                • <strong>{company}</strong>: Update <code>{data.tabName}</code> ({data.rowCount} rows)
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="info" style={{ marginTop: '1.5rem' }}>
        Tabs renamed automatically | Data formatted | Headers preserved
      </div>

      {error && <div className="error">{error}</div>}

      <div className="controls">
        <button onClick={onBack} className="secondary">← Back</button>
        <button onClick={handleNext} disabled={loading}>
          {loading ? 'Configuring...' : 'Update Google Sheet'}
        </button>
      </div>
    </div>
  );
}

