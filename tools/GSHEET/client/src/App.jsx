import React, { useState } from 'react';
import UploadStep from './components/UploadStep';
import ExtractStep from './components/ExtractStep';
import DetectStep from './components/DetectStep';
import ProcessStep from './components/ProcessStep';
import ConfigureStep from './components/ConfigureStep';
import SyncStep from './components/SyncStep';
import Stepper from './components/Stepper';

const STEPS = [
  { id: 1, title: "Upload", caption: "Bring in CSV or Excel files" },
  { id: 2, title: "Extract", caption: "Extract product names (optional)" },
  { id: 3, title: "Detect", caption: "Identify companies automatically" },
  { id: 4, title: "Process", caption: "Clean data & preview tabs" },
  { id: 5, title: "Configure", caption: "Pick update behaviour" },
  { id: 6, title: "Sync", caption: "Update Google Sheets" },
];

export default function App() {
  const [step, setStep] = useState(1);
  const [files, setFiles] = useState([]);
  const [extractedFiles, setExtractedFiles] = useState([]);
  const [companyMap, setCompanyMap] = useState({});
  const [processedCompanies, setProcessedCompanies] = useState({});
  const [updateMode, setUpdateMode] = useState('Replace');

  const resetWizard = () => {
    setStep(1);
    setFiles([]);
    setExtractedFiles([]);
    setCompanyMap({});
    setProcessedCompanies({});
    setUpdateMode('Replace');
  };

  const progressValue = (step - 1) / (STEPS.length - 1);

  return (
    <div className="app">
      {/* Hero Card */}
      <div className="hero-card">
        <span className="hero-badge">MeddeyGo</span>
        <h1>Google Sheets Update Wizard</h1>
        <p>Modernize your update flow with a guided experience that cleans files, detects companies, and syncs data to Google Sheets with confidence.</p>
        <div className="hero-meta">
          <span>6 guided stages</span>
          <span>Automatic tab renaming</span>
          <span>Smart message status filters</span>
        </div>
      </div>

      <Stepper step={step} total={6} />

      {/* Progress Bar */}
      <div className="progress-bar">
        <div className="progress-bar-fill" style={{ width: `${progressValue * 100}%` }}></div>
      </div>
      <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '2rem' }}>
        Step {step} of {STEPS.length} • {STEPS[step - 1]?.title}
      </p>

      <main>
        {step === 1 && (
          <UploadStep
            onUploaded={(uploadedFiles) => {
              setFiles(uploadedFiles);
              setStep(2);
            }}
          />
        )}

        {step === 2 && (
          <ExtractStep
            files={files}
            onExtracted={(extracted) => {
              setExtractedFiles(extracted);
              setStep(3);
            }}
            onBack={() => setStep(1)}
          />
        )}

        {step === 3 && (
          <DetectStep
            files={extractedFiles.length > 0 ? extractedFiles : files}
            onDetected={({ files: detectedFiles, companyMap: detectedMap }) => {
              setFiles(detectedFiles);
              setCompanyMap(detectedMap);
              setStep(4);
            }}
            onBack={() => setStep(2)}
          />
        )}

        {step === 4 && (
          <ProcessStep
            files={files}
            companyMap={companyMap}
            onProcessed={(processed) => {
              setProcessedCompanies(processed);
              setStep(5);
            }}
            onBack={() => setStep(3)}
          />
        )}

        {step === 5 && (
          <ConfigureStep
            processedCompanies={processedCompanies}
            onConfigured={({ processedCompanies: configured, updateMode: mode }) => {
              setProcessedCompanies(configured);
              setUpdateMode(mode);
              setStep(6);
            }}
            onBack={() => setStep(4)}
          />
        )}

        {step === 6 && (
          <SyncStep
            processedCompanies={processedCompanies}
            updateMode={updateMode}
            onComplete={resetWizard}
            onBack={() => setStep(5)}
          />
        )}
      </main>
    </div>
  );
}
