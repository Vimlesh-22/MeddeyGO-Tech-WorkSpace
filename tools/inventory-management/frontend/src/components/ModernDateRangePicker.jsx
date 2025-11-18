import React, { useState } from 'react';
import { Calendar, X } from 'lucide-react';
import ModernDatePicker from './ModernDatePicker';
import './ModernDateRangePicker.css';

const ModernDateRangePicker = ({ startDate, endDate, onStartDateChange, onEndDateChange, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleClear = () => {
    onStartDateChange(null);
    onEndDateChange(null);
  };

  const formatDateRange = (start, end) => {
    if (!start && !end) return 'Select date range';
    
    const formatDate = (dateStr) => {
      if (!dateStr) return null;
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const startFormatted = formatDate(start);
    const endFormatted = formatDate(end);

    if (start && end && start === end) {
      return startFormatted; // Single date
    }
    
    if (start && end) {
      return `${startFormatted} - ${endFormatted}`;
    }
    
    if (start) {
      return `From ${startFormatted}`;
    }
    
    if (end) {
      return `Until ${endFormatted}`;
    }

    return 'Select date range';
  };

  return (
    <div className={`modern-date-range-picker ${className}`}>
      <label className="date-range-label">Date Range</label>
      
      <div className="date-range-input-wrapper">
        <button
          type="button"
          className="date-range-trigger"
          onClick={() => setIsOpen(!isOpen)}
        >
          <Calendar className="calendar-icon" size={18} />
          <span className={!startDate && !endDate ? 'placeholder' : ''}>
            {formatDateRange(startDate, endDate)}
          </span>
          {(startDate || endDate) && (
            <button
              type="button"
              className="clear-button"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              aria-label="Clear date range"
            >
              <X size={16} />
            </button>
          )}
        </button>
      </div>

      {isOpen && (
        <>
          <div className="date-range-overlay" onClick={() => setIsOpen(false)} />
          <div className="date-range-dropdown">
            <div className="date-range-pickers">
              <ModernDatePicker
                label="Start Date"
                value={startDate}
                onChange={onStartDateChange}
                className="range-picker-item"
              />
              <ModernDatePicker
                label="End Date"
                value={endDate}
                onChange={onEndDateChange}
                className="range-picker-item"
              />
            </div>

            <div className="date-range-footer">
              <button
                type="button"
                className="preset-button"
                onClick={() => {
                  const today = new Date();
                  const formatted = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                  onStartDateChange(formatted);
                  onEndDateChange(formatted);
                  setIsOpen(false);
                }}
              >
                Today
              </button>
              <button
                type="button"
                className="preset-button"
                onClick={() => {
                  const today = new Date();
                  const weekAgo = new Date(today);
                  weekAgo.setDate(weekAgo.getDate() - 7);
                  const formatDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                  onStartDateChange(formatDate(weekAgo));
                  onEndDateChange(formatDate(today));
                  setIsOpen(false);
                }}
              >
                Last 7 Days
              </button>
              <button
                type="button"
                className="preset-button"
                onClick={() => {
                  const today = new Date();
                  const monthAgo = new Date(today);
                  monthAgo.setMonth(monthAgo.getMonth() - 1);
                  const formatDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                  onStartDateChange(formatDate(monthAgo));
                  onEndDateChange(formatDate(today));
                  setIsOpen(false);
                }}
              >
                Last 30 Days
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ModernDateRangePicker;
