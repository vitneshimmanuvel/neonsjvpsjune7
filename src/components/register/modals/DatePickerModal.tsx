import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

export interface DatePickerModalProps {
  open: boolean;
  onClose: () => void;
  dateDay?: string;
  dateMonth?: string;
  dateYear?: string;
  currentValue?: string;
  onSelectDate: (dateStr: string) => void;
  canSelectBackDates?: boolean;
  dateRect?: { top: number; bottom: number; left: number; width: number } | null;
}

export function DatePickerModal(props: DatePickerModalProps) {
  const { open, onClose, dateDay, dateMonth, dateYear, currentValue, onSelectDate, canSelectBackDates, dateRect } = props;

  const [selDay, setSelDay] = useState('');
  const [selMonth, setSelMonth] = useState('');
  const [selYear, setSelYear] = useState('');
  const [viewMonth, setViewMonth] = useState(new Date().getMonth() + 1);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [yearPageOffset, setYearPageOffset] = useState(0);

  useEffect(() => {
    if (open) {
      let d = dateDay || '';
      let m = dateMonth || '';
      let y = dateYear || '';

      if (currentValue) {
        const parts = currentValue.trim().split(/[./-]/);
        if (parts.length === 3) {
          d = parts[0];
          m = parts[1];
          y = parts[2];
        }
      }

      setSelDay(d);
      setSelMonth(m);
      setSelYear(y);

      const vm = m && !isNaN(Number(m)) ? Number(m) : (new Date().getMonth() + 1);
      const vy = y && !isNaN(Number(y)) ? Number(y) : new Date().getFullYear();
      setViewMonth(vm);
      setViewYear(vy);
      setShowYearPicker(false);
      setYearPageOffset(0);
    }
  }, [open, dateDay, dateMonth, dateYear, currentValue]);

  if (!open) return null;

  const daysInMonth = (m: number, y: number) => new Date(y, m, 0).getDate();
  const firstDayOfMonth = (m: number, y: number) => new Date(y, m - 1, 1).getDay();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const handleSelect = (dayStr: string, monthStr: string, yearStr: string) => {
    if (!dayStr && !monthStr && !yearStr) {
      onSelectDate('');
      onClose();
      return;
    }
    const finalD = dayStr.padStart(2, '0');
    const finalM = monthStr.padStart(2, '0');
    const finalY = yearStr;
    onSelectDate(`${finalD}-${finalM}-${finalY}`);
    onClose();
  };

  return createPortal(
    <div className={dateRect ? "popover-overlay" : "modal-overlay"} onClick={onClose}>
      <div 
        className="popover-content date-popover modern-date-picker" 
        onClick={(e) => e.stopPropagation()}
        style={dateRect ? (() => {
          const rect = dateRect;
          const modalWidth = 280;
          const estHeight = 320; 
          const spaceBelow = window.innerHeight - rect.bottom - 12;
          const spaceAbove = rect.top - 12;
          const showAbove = spaceBelow < estHeight && spaceAbove > spaceBelow;
          const maxHeight = showAbove ? spaceAbove : spaceBelow;

          let left = rect.left + (rect.width / 2) - (modalWidth / 2);
          left = Math.max(8, Math.min(left, window.innerWidth - modalWidth - 8));

          return {
            position: 'fixed',
            left: left,
            ...(showAbove 
              ? { bottom: (window.innerHeight - rect.top) + 6 } 
              : { top: rect.bottom + 6 }
            ),
            width: `${modalWidth}px`,
            maxHeight: `${maxHeight}px`,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 10005,
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            padding: '12px'
          } as React.CSSProperties;
        })() : {}}
      >
        <div className="calendar-header">
          <button type="button" className="calendar-nav-btn" onClick={() => {
            if (viewMonth === 1) {
              setViewMonth(12);
              setViewYear(viewYear - 1);
            } else {
              setViewMonth(viewMonth - 1);
            }
          }}><ChevronLeft size={16} /></button>
          
          <div className="calendar-title">
            <span className="calendar-month">{monthNames[viewMonth - 1]}</span>
            <span 
              className="calendar-year calendar-year-clickable" 
              onClick={() => { setShowYearPicker(!showYearPicker); setYearPageOffset(0); }}
              title="Click to select year"
            >
              {viewYear} ▾
            </span>
          </div>

          <button type="button" className="calendar-nav-btn" onClick={() => {
            if (viewMonth === 12) {
              setViewMonth(1);
              setViewYear(viewYear + 1);
            } else {
              setViewMonth(viewMonth + 1);
            }
          }}><ChevronRight size={16} /></button>
        </div>

        {showYearPicker ? (
          <div className="year-picker-container">
            <div className="year-picker-nav">
              <button type="button" className="calendar-nav-btn" onClick={() => setYearPageOffset(yearPageOffset - 1)}>
                <ChevronLeft size={14} />
              </button>
              <span className="year-picker-range">
                {viewYear - 6 + yearPageOffset * 12} – {viewYear + 5 + yearPageOffset * 12}
              </span>
              <button type="button" className="calendar-nav-btn" onClick={() => setYearPageOffset(yearPageOffset + 1)}>
                <ChevronRight size={14} />
              </button>
            </div>
            <div className="year-picker-grid">
              {Array.from({ length: 12 }).map((_, i) => {
                const yr = viewYear - 6 + i + yearPageOffset * 12;
                const isCurrent = yr === viewYear;
                const isThisYear = yr === new Date().getFullYear();
                return (
                  <button
                    type="button"
                    key={yr}
                    className={`year-picker-item ${isCurrent ? 'selected' : ''} ${isThisYear ? 'current-year' : ''}`}
                    onClick={() => {
                      setViewYear(yr);
                      setShowYearPicker(false);
                    }}
                  >
                    {yr}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            <div className="calendar-weekdays">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                <div key={d} className="calendar-weekday">{d}</div>
              ))}
            </div>

            <div className="calendar-grid">
              {Array.from({ length: firstDayOfMonth(viewMonth, viewYear) }).map((_, i) => (
                <div key={`empty-${i}`} className="calendar-day empty" />
              ))}
              {Array.from({ length: daysInMonth(viewMonth, viewYear) }).map((_, i) => {
                const d = i + 1;
                const isSelected = d.toString() === selDay && viewMonth.toString() === selMonth && viewYear.toString() === selYear;
                const todayDate = new Date();
                todayDate.setHours(0, 0, 0, 0);
                const isToday = d === todayDate.getDate() && viewMonth === (todayDate.getMonth() + 1) && viewYear === todayDate.getFullYear();
                const cellDate = new Date(viewYear, viewMonth - 1, d);
                const isPast = cellDate < todayDate;
                const isPastDisabled = isPast && !canSelectBackDates;
                
                return (
                  <button 
                    type="button"
                    key={d} 
                    className={`calendar-day ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${isPastDisabled ? 'disabled' : ''}`}
                    disabled={isPastDisabled}
                    style={isPastDisabled ? { opacity: 0.35, cursor: 'not-allowed', pointerEvents: 'none' } : undefined}
                    onClick={() => {
                      if (!isPastDisabled) {
                        handleSelect(d.toString(), viewMonth.toString(), viewYear.toString());
                      }
                    }}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="calendar-footer">
          <button 
            type="button"
            className="calendar-today-btn" 
            onClick={() => {
              const today = new Date();
              handleSelect(
                today.getDate().toString(), 
                (today.getMonth() + 1).toString(), 
                today.getFullYear().toString()
              );
            }}
          >
            <CalendarIcon size={12} style={{ marginRight: 6 }} />
            Today
          </button>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button 
              type="button"
              className="calendar-clear-btn" 
              onClick={() => {
                handleSelect('', '', '');
              }}
            >
              Clear
            </button>
            <button type="button" className="calendar-cancel-btn" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
