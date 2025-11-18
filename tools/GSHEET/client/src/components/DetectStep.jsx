import React, { useState, useEffect } from 'react';
import axios from '../config/axios';

export default function DetectStep({ files, onDetected, onBack }) {
  const [detections, setDetections] = useState([]);
  const [companyMap, setCompanyMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    detectCompanies();
  }, [files]);

  const detectCompanies = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.post('/api/detect', { files });
      const results = res.data.results;
      setDetections(results);
      
      // Initialize company map with detected companies
      const initialMap = {};
      results.forEach((result) => {
        initialMap[result.name] = result.company;
      });
      setCompanyMap(initialMap);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCompanyChange = (filename, company) => {
    setCompanyMap({ ...companyMap, [filename]: company });
  };

  const handleNext = () => {
    onDetected({ files, companyMap });
  };

  if (loading) {
    return (
      <div className="shad-card">
        <h2>Step 3: Detect Companies</h2>
        <p>Detecting companies...</p>
      </div>
    );
  }

  return (
    <div className="shad-card">
      <h2>Step 3: Detect Companies</h2>
      <p>We scan filenames and the data itself to auto-suggest the best company match. Adjust if needed before continuing.</p>

      {detections.map((detection, idx) => (
        <div key={idx} className="detection-item">
          <h3>File {idx + 1}: {detection.name}</h3>
          {detection.company && (
            <div className="success">
              Auto-detected: <strong>{detection.company}</strong> ({detection.confidence}% confidence from {detection.source})
            </div>
          )}
          <label>
            Confirm or change company for {detection.name}:
            <select
              value={companyMap[detection.name] || detection.company || ''}
              onChange={(e) => handleCompanyChange(detection.name, e.target.value)}
              style={{ marginTop: '0.5rem' }}
            >
              {detection.availableCompanies?.map((company) => (
                <option key={company} value={company}>
                  {company}
                </option>
              ))}
            </select>
          </label>
        </div>
      ))}

      {error && <div className="error">{error}</div>}

      {detections.length > 0 && (
        <div className="success" style={{ marginTop: '1.5rem' }}>
          All {detections.length} files mapped to companies
        </div>
      )}

      <div className="controls">
        <button onClick={onBack} className="secondary">← Back</button>
        <button onClick={handleNext}>Next: Process Data →</button>
      </div>
    </div>
  );
}

