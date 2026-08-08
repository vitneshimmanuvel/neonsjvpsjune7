import { useState, useMemo } from 'react';
import { Check, Edit3, Eye, ChevronRight, ChevronDown, Search } from 'lucide-react';
import type { Entry, Column } from '../../../lib/api';
import { getOptionBadgeStyle } from '../../../lib/api';
import { ColumnIcon } from '../ColumnIcon';

interface ListViewProps {
  entries: Entry[];
  columns: Column[];
  onEntryClick: (entry: Entry) => void;
  onCellChange?: (entryId: number, colId: string, value: string) => void;
  canEdit: boolean;
  /** Max columns to show per row in compact mode */
  maxPreviewCols?: number;
}

export function ListView({
  entries,
  columns,
  onEntryClick,
  onCellChange,
  canEdit,
  maxPreviewCols = 4,
}: ListViewProps) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [listSearch, setListSearch] = useState('');

  // Columns to preview per row
  const previewCols = useMemo(() => {
    return columns.slice(0, maxPreviewCols);
  }, [columns, maxPreviewCols]);

  // Additional columns for expanded view
  const extraCols = useMemo(() => {
    return columns.slice(maxPreviewCols);
  }, [columns, maxPreviewCols]);

  // Filter entries by search
  const filteredEntries = useMemo(() => {
    if (!listSearch.trim()) return entries;
    const term = listSearch.toLowerCase();
    return entries.filter(entry => {
      return Object.values(entry.cells || {}).some(val =>
        val?.toLowerCase().includes(term)
      );
    });
  }, [entries, listSearch]);

  const toggleExpand = (entryId: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  };

  const renderCellValue = (col: Column, val: string) => {
    if (!val) return <span className="list-cell-empty">—</span>;

    switch (col.type) {
      case 'dropdown':
      case 'status':
      case 'yes_no': {
        const style = getOptionBadgeStyle(col, val);
        return (
          <span
            className="list-cell-badge"
            style={{
              background: style.background,
              color: style.color,
              border: `1px solid ${style.borderColor}`,
            }}
          >
            {val}
          </span>
        );
      }
      case 'checkbox':
        return val === 'true' || val === '1' ? (
          <span className="list-cell-check checked"><Check size={14} /></span>
        ) : (
          <span className="list-cell-check">☐</span>
        );
      case 'currency':
        return <span className="list-cell-currency">₹{val}</span>;
      case 'rating': {
        const rating = Math.min(Number(val) || 0, 5);
        return <span className="list-cell-rating">{'★'.repeat(rating)}{'☆'.repeat(5 - rating)}</span>;
      }
      case 'image':
        return val ? (
          <img src={val} alt="" className="list-cell-image" />
        ) : null;
      case 'url':
        return (
          <a
            href={val}
            target="_blank"
            rel="noopener noreferrer"
            className="list-cell-link"
            onClick={e => e.stopPropagation()}
          >
            {val.replace(/^https?:\/\//, '').substring(0, 30)}…
          </a>
        );
      case 'email':
        return (
          <a href={`mailto:${val}`} className="list-cell-link" onClick={e => e.stopPropagation()}>
            {val}
          </a>
        );
      case 'phone':
        return (
          <a href={`tel:${val}`} className="list-cell-link" onClick={e => e.stopPropagation()}>
            {val}
          </a>
        );
      default:
        return <span>{val.substring(0, 80)}{val.length > 80 ? '…' : ''}</span>;
    }
  };

  return (
    <div className="list-view-container">
      {/* ── List Header ── */}
      <div className="list-view-header">
        <div className="list-view-search">
          <Search size={14} />
          <input
            type="text"
            placeholder="Search records..."
            value={listSearch}
            onChange={e => setListSearch(e.target.value)}
            className="list-view-search-input"
          />
        </div>
        <span className="list-view-count">
          {filteredEntries.length} {filteredEntries.length === 1 ? 'record' : 'records'}
          {listSearch && ` (filtered from ${entries.length})`}
        </span>
      </div>

      {/* ── Column Headers ── */}
      <div className="list-view-col-headers">
        <div className="list-col-header list-col-expand" />
        <div className="list-col-header list-col-row">#</div>
        {previewCols.map(col => (
          <div key={col.id} className="list-col-header" style={{ flex: col.type === 'text' ? 2 : 1 }}>
            <ColumnIcon type={col.type} size={11} />
            <span>{col.name}</span>
          </div>
        ))}
        <div className="list-col-header list-col-action" />
      </div>

      {/* ── List Body ── */}
      <div className="list-view-body">
        {filteredEntries.length === 0 && (
          <div className="list-view-empty">
            {listSearch ? `No records matching "${listSearch}"` : 'No records yet'}
          </div>
        )}

        {filteredEntries.map(entry => {
          const isExpanded = expandedRows.has(entry.id);

          return (
            <div key={entry.id} className={`list-view-row-group ${isExpanded ? 'expanded' : ''}`}>
              {/* Main Row */}
              <div
                className="list-view-row"
                onClick={() => onEntryClick(entry)}
              >
                {/* Expand toggle */}
                {extraCols.length > 0 ? (
                  <button
                    className="list-row-expand-btn"
                    onClick={e => { e.stopPropagation(); toggleExpand(entry.id); }}
                  >
                    {isExpanded
                      ? <ChevronDown size={14} />
                      : <ChevronRight size={14} />
                    }
                  </button>
                ) : (
                  <div className="list-row-expand-btn" style={{ visibility: 'hidden' }}>
                    <ChevronRight size={14} />
                  </div>
                )}

                {/* Row number */}
                <div className="list-row-number">{entry.rowNumber}</div>

                {/* Preview cells */}
                {previewCols.map(col => (
                  <div key={col.id} className="list-row-cell" style={{ flex: col.type === 'text' ? 2 : 1 }}>
                    {renderCellValue(col, entry.cells?.[col.id.toString()] || '')}
                  </div>
                ))}

                {/* Action */}
                <div className="list-row-action">
                  {canEdit ? <Edit3 size={14} /> : <Eye size={14} />}
                </div>
              </div>

              {/* Expanded Detail */}
              {isExpanded && extraCols.length > 0 && (
                <div className="list-view-expanded">
                  {extraCols.map(col => {
                    const val = entry.cells?.[col.id.toString()] || '';
                    return (
                      <div key={col.id} className="list-expanded-field">
                        <span className="list-expanded-label">
                          <ColumnIcon type={col.type} size={11} />
                          {col.name}
                        </span>
                        <span className="list-expanded-value">
                          {renderCellValue(col, val)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        .list-view-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--background, #f8fafc);
        }

        /* ── Header ── */
        .list-view-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border, #e2e8f0);
          background: var(--surface, white);
          gap: 12px;
          flex-shrink: 0;
        }
        .list-view-search {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          background: var(--bg-secondary, #f1f5f9);
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 8px;
          color: var(--muted, #94a3b8);
          flex: 1;
          max-width: 320px;
          transition: all 0.15s;
        }
        .list-view-search:focus-within {
          border-color: var(--accent, #1a73e8);
          background: white;
          box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.1);
        }
        .list-view-search-input {
          border: none;
          background: transparent;
          outline: none;
          font-size: 13px;
          color: var(--foreground, #334155);
          width: 100%;
          font-weight: 500;
        }
        .list-view-search-input::placeholder {
          color: var(--placeholder, #94a3b8);
        }
        .list-view-count {
          font-size: 12px;
          color: var(--muted, #94a3b8);
          font-weight: 500;
          white-space: nowrap;
        }

        /* ── Column Headers ── */
        .list-view-col-headers {
          display: flex;
          align-items: center;
          gap: 2px;
          padding: 8px 16px;
          border-bottom: 1px solid var(--border, #e2e8f0);
          background: var(--bg-secondary, #f8fafc);
          flex-shrink: 0;
        }
        .list-col-header {
          font-size: 11px;
          font-weight: 700;
          color: var(--muted, #94a3b8);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          display: flex;
          align-items: center;
          gap: 4px;
          flex: 1;
          padding: 4px 8px;
          min-width: 0;
          overflow: hidden;
          white-space: nowrap;
        }
        .list-col-expand { flex: 0 0 28px; }
        .list-col-row { flex: 0 0 36px; text-align: center; justify-content: center; }
        .list-col-action { flex: 0 0 32px; }

        /* ── Body ── */
        .list-view-body {
          flex: 1;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }
        .list-view-empty {
          padding: 40px 20px;
          text-align: center;
          font-size: 14px;
          color: var(--muted, #94a3b8);
          font-weight: 500;
        }

        /* ── Row Group ── */
        .list-view-row-group {
          border-bottom: 1px solid var(--border, #e2e8f0);
        }
        .list-view-row-group.expanded {
          background: var(--bg-secondary, #f8fafc);
        }

        /* ── Row ── */
        .list-view-row {
          display: flex;
          align-items: center;
          gap: 2px;
          padding: 10px 16px;
          cursor: pointer;
          transition: background 0.1s;
          background: var(--surface, white);
        }
        .list-view-row:hover {
          background: rgba(26, 115, 232, 0.03);
        }
        .list-view-row-group.expanded > .list-view-row {
          border-bottom: 1px solid var(--border, #e2e8f0);
        }

        .list-row-expand-btn {
          flex: 0 0 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          background: none;
          color: var(--muted, #94a3b8);
          cursor: pointer;
          padding: 2px;
          border-radius: 4px;
          transition: all 0.1s;
        }
        .list-row-expand-btn:hover {
          background: var(--bg-secondary, #f1f5f9);
          color: var(--foreground, #334155);
        }

        .list-row-number {
          flex: 0 0 36px;
          font-size: 12px;
          font-weight: 700;
          color: var(--muted, #94a3b8);
          text-align: center;
        }

        .list-row-cell {
          flex: 1;
          font-size: 13px;
          color: var(--foreground, #334155);
          font-weight: 500;
          padding: 2px 8px;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
          min-width: 0;
        }

        .list-row-action {
          flex: 0 0 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--placeholder, #cbd5e1);
          opacity: 0;
          transition: opacity 0.15s;
        }
        .list-view-row:hover .list-row-action {
          opacity: 1;
          color: var(--accent, #1a73e8);
        }

        /* ── Expanded Detail ── */
        .list-view-expanded {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 8px;
          padding: 12px 16px 12px 82px;
          animation: listExpandIn 0.15s ease-out;
        }
        @keyframes listExpandIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .list-expanded-field {
          display: flex;
          flex-direction: column;
          gap: 3px;
          padding: 6px 10px;
          background: var(--surface, white);
          border-radius: 8px;
          border: 1px solid var(--border, #e2e8f0);
        }
        .list-expanded-label {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          font-weight: 600;
          color: var(--muted, #94a3b8);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .list-expanded-value {
          font-size: 13px;
          color: var(--foreground, #334155);
          font-weight: 500;
        }

        /* ── Cell Renderers ── */
        .list-cell-empty {
          color: var(--placeholder, #cbd5e1);
        }
        .list-cell-badge {
          display: inline-flex;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
          white-space: nowrap;
        }
        .list-cell-check {
          color: var(--placeholder, #cbd5e1);
        }
        .list-cell-check.checked {
          color: var(--success, #10b981);
        }
        .list-cell-currency {
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }
        .list-cell-rating {
          color: #f59e0b;
          letter-spacing: 2px;
          font-size: 14px;
        }
        .list-cell-image {
          width: 28px;
          height: 28px;
          border-radius: 4px;
          object-fit: cover;
        }
        .list-cell-link {
          color: var(--accent, #1a73e8);
          text-decoration: none;
          font-weight: 500;
        }
        .list-cell-link:hover {
          text-decoration: underline;
        }

        /* ── Responsive ── */
        @media (max-width: 768px) {
          .list-view-col-headers {
            display: none;
          }
          .list-view-row {
            flex-wrap: wrap;
            gap: 4px;
            padding: 12px 12px;
          }
          .list-row-cell {
            flex: 0 0 auto;
            max-width: 100%;
          }
          .list-view-expanded {
            padding: 8px 12px;
            grid-template-columns: 1fr;
          }
          .list-view-header {
            flex-direction: column;
            align-items: stretch;
          }
          .list-view-search {
            max-width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
