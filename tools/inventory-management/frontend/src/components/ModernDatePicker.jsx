import React, { useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import './ModernDatePicker.css';

const ModernDatePicker = ({ value, onChange, label = 'Select Date', className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(value ? new Date(value) : new Date());
  const [selectedDate, setSelectedDate] = useState(value ? new Date(value) : null);

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    // Add all days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    
    return days;
  };

  const handlePreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const handleDateSelect = (date) => {
    if (!date) return;
    setSelectedDate(date);
    // Format as YYYY-MM-DD in local timezone
    const formatted = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    onChange(formatted);
    setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    setSelectedDate(null);
    onChange(null);
  };

  const isToday = (date) => {
    if (!date) return false;
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  const isSameDay = (date1, date2) => {
    if (!date1 || !date2) return false;
    return date1.getDate() === date2.getDate() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getFullYear() === date2.getFullYear();
  };

  const formatDisplayDate = (date) => {
    if (!date) return '';
    const options = { month: 'short', day: 'numeric', year: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  };

  const days = getDaysInMonth(currentMonth);

  return (
    <div className={`modern-date-picker ${className}`}>
      <label className="date-picker-label">{label}</label>
      <div className="date-picker-input-wrapper">
        <button
          type="button"
          className="date-picker-trigger"
          onClick={() => setIsOpen(!isOpen)}
        >
          <Calendar className="calendar-icon" size={18} />
          <span className={!selectedDate ? 'placeholder' : ''}>
            {selectedDate ? formatDisplayDate(selectedDate) : 'Choose a date'}
          </span>
          {selectedDate && (
            <button
              type="button"
              className="clear-button"
              onClick={handleClear}
              aria-label="Clear date"
            >
              <X size={16} />
            </button>
          )}
        </button>
      </div>

      {isOpen && (
        <>
          <div className="date-picker-overlay" onClick={() => setIsOpen(false)} />
          <div className="date-picker-dropdown">
            {/* Month Navigation */}
            <div className="calendar-header">
              <button
                type="button"
                className="nav-button"
                onClick={handlePreviousMonth}
                aria-label="Previous month"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="current-month">
                {months[currentMonth.getMonth()]} {currentMonth.getFullYear()}
              </div>
              <button
                type="button"
                className="nav-button"
                onClick={handleNextMonth}
                aria-label="Next month"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            {/* Week Days */}
            <div className="weekdays-grid">
              {weekDays.map((day) => (
                <div key={day} className="weekday-label">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Days */}
            <div className="calendar-grid">
              {days.map((date, index) => (
                <button
                  key={index}
                  type="button"
                  className={`
                    calendar-day
                    ${!date ? 'empty' : ''}
                    ${date && isToday(date) ? 'today' : ''}
                    ${date && isSameDay(date, selectedDate) ? 'selected' : ''}
                  `}
                  onClick={() => handleDateSelect(date)}
                  disabled={!date}
                >
                  {date ? date.getDate() : ''}
                </button>
              ))}
            </div>

            {/* Today Button */}
            <div className="calendar-footer">
              <button
                type="button"
                className="today-button"
                onClick={() => handleDateSelect(new Date())}
              >
                Today
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ModernDatePicker;
