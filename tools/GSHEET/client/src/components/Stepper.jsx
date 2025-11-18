import React from 'react';

const STEPS = [
  { id: 1, title: "Upload", caption: "Bring in CSV or Excel files" },
  { id: 2, title: "Extract", caption: "Extract product names (optional)" },
  { id: 3, title: "Detect", caption: "Identify companies automatically" },
  { id: 4, title: "Process", caption: "Clean data & preview tabs" },
  { id: 5, title: "Configure", caption: "Pick update behaviour" },
  { id: 6, title: "Sync", caption: "Update Google Sheets" },
];

export default function Stepper({ step, total }) {
  return (
    <div className="wizard-stepper">
      {STEPS.map((s, i) => {
        let state = 'upcoming';
        if (s.id < step) state = 'done';
        else if (s.id === step) state = 'current';
        
        const connector = i < STEPS.length - 1 ? <div className="step-connector"></div> : null;
        const delay = i * 0.08;
        
        return (
          <div 
            key={s.id} 
            className={`step ${state}`}
            style={{ animationDelay: `${delay}s` }}
          >
            <div className="step-index">{s.id}</div>
            <div className="step-copy">
              <p className="step-title">{s.title}</p>
              <p className="step-caption">{s.caption}</p>
            </div>
            {connector}
          </div>
        );
      })}
    </div>
  );
}
