import React, { useState, useEffect } from 'react';
import axios from '../config/axios';

export default function ProcessStep({ files, companyMap, onProcessed, onBack }) {
  const [processed, setProcessed] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    processData();
  }, []);

  const processData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.post('/api/process', { files, companyMap });
      setProcessed(res.data.processed);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="shad-card">
        <h2>Step 4: Process Data & Calculate Tab Names</h2>
        <p>Processing data...</p>
      </div>
    );
  }

  if (error) {
    return (
    <div className="shad-card">
      <h2>Step 4: Process Data & Calculate Tab Names</h2>
      <div className="error">{error}</div>
      <div className="controls">
        <button onClick={onBack} className="secondary">← Back</button>
      </div>
    </div>
    );
  }

  if (!processed) {
    return null;
  }

  const hasInvalidTabs = Object.values(processed).some((data) => !data.tabName);

  return (
    <div className="shad-card">
      <h2>Step 4: Process Data & Calculate Tab Names</h2>
      <p>We clean and combine files per company, automatically filter message statuses, and plan tab updates.</p>

      <div className="info">
        <strong>Files and Company Assignments:</strong>
        {files.map((file, idx) => (
          <div key={idx} style={{ marginTop: '0.5rem' }}>
            {idx + 1}. <code>{file.name}</code> → <strong>{companyMap[file.name]}</strong>
          </div>
        ))}
      </div>

      <hr />

      <div className="success">
        Grouped into <strong>{Object.keys(processed).length} unique {Object.keys(processed).length === 1 ? 'company' : 'companies'}</strong>
      </div>
      
      {Object.entries(processed).map(([company, data]) => (
        <div key={company} style={{ marginTop: '1rem' }}>
          <div className="success">
            <strong>{company}</strong>: {Object.keys(processed).filter(c => c === company).length} file(s), {data.rowCount} total rows
          </div>
        </div>
      ))}

      <hr />

      {Object.entries(processed).map(([company, data]) => (
        <div key={company} style={{ marginBottom: '2rem' }}>
          <h3>{company}</h3>
          
          {data.removedByStatus > 0 && (
            <div className="success" style={{ marginTop: '1rem' }}>
              Total filtered: <strong>{data.removedByStatus}</strong> rows removed (Accepted/Delivered status)
            </div>
          )}
          
          {data.tabName ? (
            <div style={{ marginTop: '1rem' }}>
              {data.oldTabName && data.oldTabName !== data.tabName ? (
                <div>
                  <div className="success">Current Tab: <strong>{data.oldTabName}</strong></div>
                  <div className="warning">Will Rename To: <strong>{data.tabName}</strong></div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    ✨ Tab name calculated from CSV date + 1 day
                  </p>
                </div>
              ) : (
                <div className="success">Using Existing Tab: <strong>{data.tabName}</strong></div>
              )}
            </div>
          ) : (
            <div className="error">No tab found for {company}</div>
          )}
          
          <div className="metrics" style={{ marginTop: '1.5rem' }}>
            <div>
              <strong>Total Rows</strong>
              <div>{data.rowCount}</div>
            </div>
            {data.tabName && (
              <div>
                <strong>Tab Name</strong>
                <div>{data.tabName}</div>
              </div>
            )}
          </div>
          
          <details style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(8, 12, 24, 0.5)', borderRadius: '0.75rem' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Preview (first 5 rows)</summary>
            <div style={{ marginTop: '1rem', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(148, 163, 255, 0.12)' }}>
                    {data.dataframe && data.dataframe.length > 0 && Object.keys(data.dataframe[0]).map((key) => (
                      <th key={key} style={{ padding: '0.5rem', textAlign: 'left', fontWeight: 600 }}>
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.dataframe && data.dataframe.slice(0, 5).map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(148, 163, 255, 0.08)' }}>
                      {Object.values(row).map((val, i) => (
                        <td key={i} style={{ padding: '0.5rem' }}>
                          {String(val || '').substring(0, 50)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      ))}

      <div className="info" style={{ marginTop: '1.5rem' }}>
        Message Status filtered (Accepted/Delivered removed) | Phone numbers formatted | Data cleaned | Duplicates removed
      </div>

      {hasInvalidTabs && (
        <div className="error" style={{ marginTop: '1rem' }}>
          Cannot proceed: Some companies don't have valid tabs
        </div>
      )}

      <div className="controls">
        <button onClick={onBack} className="secondary">← Back</button>
        <button onClick={() => onProcessed(processed)} disabled={hasInvalidTabs}>
          Next: Choose Update Mode →
        </button>
      </div>
    </div>
  );
}

