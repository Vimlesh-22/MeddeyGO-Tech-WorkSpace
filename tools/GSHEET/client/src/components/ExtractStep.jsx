import React, { useState } from 'react';
import axios from '../config/axios';

export default function ExtractStep({ files, onExtracted, onBack }) {
  const [extractProducts, setExtractProducts] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleExtract = async () => {
    if (!extractProducts) {
      onExtracted(files);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await axios.post('/api/extract', { files });
      onExtracted(res.data.results);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="shad-card">
      <h2>Step 2: Extract Product Names (Optional)</h2>
      <p>Extract product names from message text. You can skip this step if your data already contains product names.</p>
      
      <div className="radio-group">
        <label>
          <input
            type="radio"
            checked={!extractProducts}
            onChange={() => setExtractProducts(false)}
          />
          Skip - Data already has product names
        </label>
        <label>
          <input
            type="radio"
            checked={extractProducts}
            onChange={() => setExtractProducts(true)}
          />
          Extract product names from text
        </label>
      </div>

      {extractProducts && (
        <div className="info">
          Product extraction will be performed on all files
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <div className="controls">
        <button onClick={onBack} className="secondary">← Back</button>
        <button onClick={handleExtract} disabled={loading}>
          {loading ? 'Extracting...' : 'Next: Detect Companies →'}
        </button>
      </div>
    </div>
  );
}

