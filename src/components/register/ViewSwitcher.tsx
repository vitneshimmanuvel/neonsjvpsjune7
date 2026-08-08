import { useState } from 'react';
import { Table2, Kanban, List, ChevronDown } from 'lucide-react';

export type ViewType = 'table' | 'kanban' | 'list';

interface ViewSwitcherProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
  /** Which column types exist — used to show/hide Kanban (needs dropdown/status) */
  hasDropdownColumn?: boolean;
  compact?: boolean;
}

const VIEW_OPTIONS: { id: ViewType; label: string; icon: typeof Table2; description: string }[] = [
  { id: 'table',  label: 'Table',  icon: Table2,  description: 'Spreadsheet view with rows and columns' },
  { id: 'kanban', label: 'Kanban', icon: Kanban,   description: 'Board view grouped by status' },
  { id: 'list',   label: 'List',   icon: List,     description: 'Compact list view' },
];

export function ViewSwitcher({ activeView, onViewChange, hasDropdownColumn = true, compact }: ViewSwitcherProps) {
  const [showDropdown, setShowDropdown] = useState(false);

  const activeOption = VIEW_OPTIONS.find(v => v.id === activeView) || VIEW_OPTIONS[0];
  const ActiveIcon = activeOption.icon;

  return (
    <div className="view-switcher-container" style={{ position: 'relative' }}>
      {/* ── Segmented Control (Desktop) ── */}
      <div className={`view-switcher-segment ${compact ? 'compact' : ''}`}>
        {VIEW_OPTIONS.map(opt => {
          const Icon = opt.icon;
          const isActive = activeView === opt.id;
          const isDisabled = opt.id === 'kanban' && !hasDropdownColumn;

          return (
            <button
              key={opt.id}
              className={`view-switcher-btn ${isActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
              onClick={() => {
                if (!isDisabled) onViewChange(opt.id);
              }}
              title={isDisabled ? 'Add a Dropdown or Status column to use Kanban view' : opt.description}
              disabled={isDisabled}
            >
              <Icon size={14} />
              <span className="view-switcher-label">{opt.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Dropdown Trigger (Mobile) ── */}
      <button
        className="view-switcher-mobile-trigger"
        onClick={() => setShowDropdown(!showDropdown)}
      >
        <ActiveIcon size={14} />
        <span>{activeOption.label}</span>
        <ChevronDown size={12} style={{ opacity: 0.6, transform: showDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {/* ── Mobile Dropdown ── */}
      {showDropdown && (
        <>
          <div
            className="view-switcher-backdrop"
            onClick={() => setShowDropdown(false)}
          />
          <div className="view-switcher-dropdown">
            {VIEW_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const isActive = activeView === opt.id;
              const isDisabled = opt.id === 'kanban' && !hasDropdownColumn;

              return (
                <button
                  key={opt.id}
                  className={`view-switcher-dropdown-item ${isActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
                  onClick={() => {
                    if (!isDisabled) {
                      onViewChange(opt.id);
                      setShowDropdown(false);
                    }
                  }}
                  disabled={isDisabled}
                >
                  <Icon size={16} />
                  <div className="view-switcher-dropdown-text">
                    <span className="view-switcher-dropdown-label">{opt.label}</span>
                    <span className="view-switcher-dropdown-desc">{isDisabled ? 'Requires a Dropdown/Status column' : opt.description}</span>
                  </div>
                  {isActive && (
                    <div className="view-switcher-check">✓</div>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      <style>{`
        .view-switcher-container {
          display: inline-flex;
          align-items: center;
        }

        /* ── Segmented Control ── */
        .view-switcher-segment {
          display: flex;
          align-items: center;
          gap: 2px;
          background: var(--bg-secondary, #f1f5f9);
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 10px;
          padding: 3px;
        }
        .view-switcher-segment.compact {
          border-radius: 8px;
          padding: 2px;
        }

        .view-switcher-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border: none;
          border-radius: 8px;
          background: transparent;
          color: var(--muted, #64748b);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          white-space: nowrap;
          position: relative;
        }
        .view-switcher-segment.compact .view-switcher-btn {
          padding: 5px 10px;
          font-size: 12px;
          border-radius: 6px;
        }

        .view-switcher-btn:hover:not(.disabled):not(.active) {
          background: rgba(0, 0, 0, 0.04);
          color: var(--foreground, #334155);
        }

        .view-switcher-btn.active {
          background: white;
          color: var(--accent, #1a73e8);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
        }

        .view-switcher-btn.disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .view-switcher-label {
          line-height: 1;
        }

        /* ── Mobile Trigger ── */
        .view-switcher-mobile-trigger {
          display: none;
          align-items: center;
          gap: 6px;
          padding: 7px 12px;
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 8px;
          background: var(--surface, white);
          color: var(--foreground, #334155);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }
        .view-switcher-mobile-trigger:hover {
          border-color: var(--accent, #1a73e8);
        }

        /* ── Dropdown ── */
        .view-switcher-backdrop {
          position: fixed;
          inset: 0;
          z-index: 999;
        }
        .view-switcher-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          z-index: 1000;
          background: var(--surface, white);
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
          padding: 6px;
          min-width: 240px;
          animation: viewSwitcherDropIn 0.15s ease-out;
        }

        @keyframes viewSwitcherDropIn {
          from { opacity: 0; transform: translateY(-4px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .view-switcher-dropdown-item {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 10px 12px;
          border: none;
          border-radius: 8px;
          background: transparent;
          cursor: pointer;
          transition: all 0.15s;
          text-align: left;
          color: var(--foreground, #334155);
        }
        .view-switcher-dropdown-item:hover:not(.disabled) {
          background: var(--bg-secondary, #f1f5f9);
        }
        .view-switcher-dropdown-item.active {
          background: rgba(26, 115, 232, 0.08);
          color: var(--accent, #1a73e8);
        }
        .view-switcher-dropdown-item.disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .view-switcher-dropdown-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
          flex: 1;
          min-width: 0;
        }
        .view-switcher-dropdown-label {
          font-size: 13px;
          font-weight: 600;
        }
        .view-switcher-dropdown-desc {
          font-size: 11px;
          color: var(--muted, #94a3b8);
          font-weight: 400;
        }

        .view-switcher-check {
          font-size: 14px;
          font-weight: 700;
          color: var(--accent, #1a73e8);
          flex-shrink: 0;
        }

        /* ── Responsive ── */
        @media (max-width: 640px) {
          .view-switcher-segment {
            display: none;
          }
          .view-switcher-mobile-trigger {
            display: flex;
          }
        }
      `}</style>
    </div>
  );
}
