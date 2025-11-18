import React, { useState } from 'react';
import axios from '../config/axios';

export default function UploadStep({ onUploaded }) {
  const [files, setFiles] = useState(null);
  const [status, setStatus] = useState('');

  const handleUpload = async () => {
    if (!files || files.length === 0) return;
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    setStatus('Uploading...');
    try {
      const res = await axios.post('/api/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setStatus('Uploaded');
      onUploaded(res.data.files);
    } catch (e) {
      setStatus('Upload failed: ' + (e.response?.data?.error || e.message));
    }
  };

  return (
    <div className="shad-card">
      <h2>Step 1: Upload Files</h2>
      <p>Drag in your CSV or Excel exports. We'll handle the sanitization and prep for you.</p>
      
      <hr />
      
      <div style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>📅 Date Format</h3>
        <div className="info">
          ℹ️ <strong>Dates will be preserved exactly as they appear in your CSV files</strong> - no conversion or reformatting will be applied.
        </div>
      </div>
      
      <hr />
      
      <div style={{ marginBottom: '1.5rem' }}>
        <label>Upload Excel or CSV files</label>
        <input 
          type="file" 
          multiple 
          accept=".csv,.xlsx,.xls" 
          onChange={(e) => setFiles(e.target.files)}
          style={{ marginTop: '0.5rem' }}
        />
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
          You can upload multiple files for different companies
        </p>
      </div>
      
      {files && files.length > 0 && (
        <div className="success">
          ✅ {files.length} file(s) uploaded
        </div>
      )}
      
      {status && (
        <div className={status.includes('failed') || status.includes('error') ? 'error' : status.includes('Uploaded') ? 'success' : 'info'}>
          {status}
        </div>
      )}
      
      <div className="controls">
        <button 
          onClick={handleUpload} 
          disabled={!files || files.length === 0}
          style={{ marginLeft: 'auto' }}
        >
          Next: Detect Companies →
        </button>
      </div>
    </div>
  );
}
