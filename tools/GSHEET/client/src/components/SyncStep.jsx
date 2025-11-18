import React, { useState, useEffect } from 'react';
import axios from '../config/axios';

export default function SyncStep({ processedCompanies, updateMode, onComplete, onBack }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    syncData();
  }, []);

  const syncData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.post('/api/sync', { processedCompanies, updateMode });
      setResults(res.data.results);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="shad-card">
        <h2>Step 6: Updating Google Sheet...</h2>
        <p>Processing {Object.keys(processedCompanies).length} {Object.keys(processedCompanies).length === 1 ? 'company' : 'companies'}...</p>
        <div className="progress-bar" style={{ marginTop: '1.5rem' }}>
          <div className="progress-bar-fill" style={{ width: '60%' }}></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="shad-card">
        <h2>Step 6: Update Results</h2>
        <div className="error">{error}</div>
        <div className="controls">
          <button onClick={onBack} className="secondary">← Back</button>
        </div>
      </div>
    );
  }

  if (!results) {
    return null;
  }

  const allSuccess = Object.values(results).every((r) => r.success);

  return (
    <div className="shad-card">
      <h2>Step 6: Update Results</h2>

      {allSuccess ? (
        <div className="success" style={{ fontSize: '1.1rem', padding: '1.5rem' }}>
          <h3 style={{ margin: 0 }}>🎉 All companies updated successfully!</h3>
        </div>
      ) : (
        <div className="error">Some updates failed. Please check the errors above.</div>
      )}

      <hr />

      <div className="update-summary">
        <h3>Update Summary</h3>
        {Object.entries(processedCompanies).map(([company, data]) => {
          const result = results[company];
          return (
            <div key={company} style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(8, 12, 24, 0.5)', borderRadius: '0.75rem' }}>
              {data.oldTabName && data.oldTabName !== data.tabName ? (
                <div>
                  <strong>{company}</strong>: Renamed <code>{data.oldTabName}</code> → <code>{data.tabName}</code> | {data.rowCount} rows
                  {result?.success ? ' ✅' : ' ❌'}
                </div>
              ) : (
                <div>
                  <strong>{company}</strong>: Updated <code>{data.tabName}</code> | {data.rowCount} rows
                  {result?.success ? ' ✅' : ' ❌'}
                </div>
              )}
              {result?.error && (
                <div className="error" style={{ marginTop: '0.5rem' }}>
                  {result.error}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="controls">
        <button onClick={onComplete} className="secondary" style={{ width: '100%' }}>
          Upload More Files
        </button>
        <button onClick={onComplete} style={{ width: '100%' }}>
          Done
        </button>
      </div>
    </div>
  );
}

