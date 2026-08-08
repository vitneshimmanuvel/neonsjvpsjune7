import { useState, useCallback, useRef, useMemo } from 'react';
import { GripVertical, Plus, ChevronDown, ChevronRight, ChevronsRight, ChevronsLeft } from 'lucide-react';
import type { Entry, Column } from '../../../lib/api';
import { getOptionBadgeStyle } from '../../../lib/api';
import { ColumnIcon } from '../ColumnIcon';

interface KanbanViewProps {
  entries: Entry[];
  columns: Column[];
  /** The column whose values define board lanes (must be dropdown/status/yes_no) */
  groupByColumnId: number | null;
  onGroupByChange: (colId: number) => void;
  onCellChange: (entryId: number, colId: string, value: string) => void;
  onEntryClick: (entry: Entry) => void;
  onAddEntry?: () => void;
  canEdit: boolean;
  /** Which columns to show as preview fields on cards */
  previewColumnIds?: number[];
}

interface DragState {
  entryId: number;
  fromLane: string;
}

export function KanbanView({
  entries,
  columns,
  groupByColumnId,
  onGroupByChange,
  onCellChange,
  onEntryClick,
  onAddEntry,
  canEdit,
  previewColumnIds,
}: KanbanViewProps) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOverLane, setDragOverLane] = useState<string | null>(null);
  const [collapsedLanes, setCollapsedLanes] = useState<Set<string>>(new Set());
  const [showGroupByPicker, setShowGroupByPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const dragCounter = useRef<Record<string, number>>({});

  // Determine valid group-by columns
  const groupableColumns = useMemo(() => {
    return columns.filter(c => ['dropdown', 'status', 'yes_no'].includes(c.type || 'text'));
  }, [columns]);

  // Active group-by column
  const groupByCol = useMemo(() => {
    if (groupByColumnId) return columns.find(c => c.id === groupByColumnId) || null;
    return groupableColumns[0] || null;
  }, [groupByColumnId, groupableColumns, columns]);

  // Build lanes from dropdown options
  const { lanes, entriesByLane } = useMemo(() => {
    if (!groupByCol) return { lanes: [], entriesByLane: {} };

    let options: string[] = [];
    if (groupByCol.type === 'yes_no') {
      options = ['Yes', 'No'];
    } else if (groupByCol.dropdownOptions?.length) {
      options = [...groupByCol.dropdownOptions];
    } else {
      // Infer from data
      const values = new Set<string>();
      entries.forEach(e => {
        const val = e.cells?.[groupByCol.id.toString()];
        if (val && val.trim()) values.add(val.trim());
      });
      options = Array.from(values);
    }

    const map: Record<string, Entry[]> = {};
    options.forEach(opt => { map[opt] = []; });
    map['(Uncategorized)'] = [];

    entries.forEach(entry => {
      const val = entry.cells?.[groupByCol.id.toString()]?.trim() || '';
      if (val && map[val]) {
        map[val].push(entry);
      } else {
        map['(Uncategorized)'].push(entry);
      }
    });

    // Only include "(Uncategorized)" if it actually has records
    const finalLanes: string[] = [];
    if (map['(Uncategorized)'].length > 0) {
      finalLanes.push('(Uncategorized)');
    }
    options.forEach(opt => {
      if (!finalLanes.includes(opt)) finalLanes.push(opt);
    });

    return { lanes: finalLanes, entriesByLane: map };
  }, [groupByCol, entries]);

  // Preview columns — first 3 non-group columns
  const displayCols = useMemo(() => {
    if (previewColumnIds?.length) {
      return previewColumnIds.map(id => columns.find(c => c.id === id)).filter(Boolean) as Column[];
    }
    return columns
      .filter(c => c.id !== groupByCol?.id)
      .slice(0, 3);
  }, [columns, groupByCol, previewColumnIds]);

  // ── Drag handlers ──
  const handleDragStart = useCallback((e: React.DragEvent, entry: Entry, fromLane: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', entry.id.toString());
    setDragState({ entryId: entry.id, fromLane });

    const target = e.currentTarget as HTMLDivElement;
    setTimeout(() => {
      target.style.opacity = '0.35';
    }, 0);
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    const target = e.currentTarget as HTMLDivElement;
    target.style.opacity = '1';
    setDragState(null);
    setDragOverLane(null);
    dragCounter.current = {};
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent, lane: string) => {
    e.preventDefault();
    if (!dragCounter.current[lane]) dragCounter.current[lane] = 0;
    dragCounter.current[lane]++;
    setDragOverLane(lane);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent, lane: string) => {
    e.preventDefault();
    dragCounter.current[lane]--;
    if (dragCounter.current[lane] <= 0) {
      dragCounter.current[lane] = 0;
      if (dragOverLane === lane) setDragOverLane(null);
    }
  }, [dragOverLane]);

  const handleDrop = useCallback((e: React.DragEvent, toLane: string) => {
    e.preventDefault();
    if (!dragState || !groupByCol || !canEdit) return;

    const value = toLane === '(Uncategorized)' ? '' : toLane;
    if (dragState.fromLane !== toLane) {
      onCellChange(dragState.entryId, groupByCol.id.toString(), value);
    }

    setDragState(null);
    setDragOverLane(null);
    dragCounter.current = {};
  }, [dragState, groupByCol, canEdit, onCellChange]);

  const toggleCollapse = useCallback((lane: string) => {
    setCollapsedLanes(prev => {
      const next = new Set(prev);
      if (next.has(lane)) next.delete(lane);
      else next.add(lane);
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setCollapsedLanes(new Set(lanes));
  }, [lanes]);

  const expandAll = useCallback(() => {
    setCollapsedLanes(new Set());
  }, []);

  // ── No group-by column available ──
  if (!groupByCol) {
    return (
      <div className="kanban-empty-state">
        <div className="kanban-empty-icon">📋</div>
        <h3>No Kanban Column Available</h3>
        <p>Add a <strong>Dropdown</strong>, <strong>Status</strong>, or <strong>Yes/No</strong> column to use the Kanban board.</p>
      </div>
    );
  }

  return (
    <div className="kanban-container">
      {/* ── Board Header / Controls ── */}
      <div className="kanban-header">
        <div className="kanban-header-left">
          <span className="kanban-header-label">GROUP BY:</span>
          <div style={{ position: 'relative' }}>
            <button
              className="kanban-group-by-btn"
              onClick={() => setShowGroupByPicker(!showGroupByPicker)}
            >
              <ColumnIcon type={groupByCol.type} size={13} />
              <span className="kanban-group-by-name">{groupByCol.name}</span>
              <ChevronDown size={13} />
            </button>

            {showGroupByPicker && (
              <>
                <div className="kanban-picker-backdrop" onClick={() => setShowGroupByPicker(false)} />
                <div className="kanban-picker-dropdown">
                  <div className="kanban-picker-title">Select Column to Group by</div>
                  {groupableColumns.length > 5 && (
                    <div className="kanban-picker-search-wrap">
                      <input
                        type="text"
                        placeholder="Search columns..."
                        value={pickerSearch}
                        onChange={e => setPickerSearch(e.target.value)}
                        className="kanban-picker-search"
                        autoFocus
                      />
                    </div>
                  )}
                  <div className="kanban-picker-list">
                    {groupableColumns
                      .filter(c => !pickerSearch.trim() || c.name.toLowerCase().includes(pickerSearch.toLowerCase()))
                      .map(col => (
                        <button
                          key={col.id}
                          className={`kanban-picker-item ${col.id === groupByCol.id ? 'active' : ''}`}
                          onClick={() => { onGroupByChange(col.id); setShowGroupByPicker(false); setPickerSearch(''); }}
                        >
                          <ColumnIcon type={col.type} size={14} />
                          <span className="kanban-picker-item-name">{col.name}</span>
                          {col.id === groupByCol.id && <span className="kanban-picker-check">✓</span>}
                        </button>
                      ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="kanban-header-actions">
            {collapsedLanes.size > 0 ? (
              <button className="kanban-toggle-all-btn" onClick={expandAll} title="Expand all columns">
                <ChevronsRight size={13} />
                <span>Expand all</span>
              </button>
            ) : (
              <button className="kanban-toggle-all-btn" onClick={collapseAll} title="Collapse all columns">
                <ChevronsLeft size={13} />
                <span>Collapse all</span>
              </button>
            )}
          </div>
        </div>

        <div className="kanban-header-right">
          <span className="kanban-stat">{entries.length} records &bull; {lanes.length} lanes</span>
        </div>
      </div>

      {/* ── Board Lanes ── */}
      <div className="kanban-board">
        {lanes.map(lane => {
          const laneEntries = entriesByLane[lane] || [];
          const isCollapsed = collapsedLanes.has(lane);
          const isDragOver = dragOverLane === lane && dragState?.fromLane !== lane;
          const badgeStyle = lane !== '(Uncategorized)'
            ? getOptionBadgeStyle(groupByCol, lane)
            : { background: '#f1f5f9', color: '#64748b', borderColor: '#e2e8f0' };

          if (isCollapsed) {
            return (
              <div
                key={lane}
                className={`kanban-lane collapsed ${isDragOver ? 'drag-over' : ''}`}
                onClick={() => toggleCollapse(lane)}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                onDragEnter={e => handleDragEnter(e, lane)}
                onDragLeave={e => handleDragLeave(e, lane)}
                onDrop={e => handleDrop(e, lane)}
                title={`Click to expand "${lane}" (${laneEntries.length} records)`}
              >
                <div className="kanban-collapsed-top">
                  <button className="kanban-collapsed-btn">
                    <ChevronRight size={14} />
                  </button>
                  <span className="kanban-collapsed-count">{laneEntries.length}</span>
                </div>
                <div className="kanban-collapsed-label-rail">
                  <span
                    className="kanban-collapsed-badge"
                    style={{
                      background: badgeStyle.background,
                      color: badgeStyle.color,
                      borderColor: badgeStyle.borderColor,
                    }}
                  >
                    {lane}
                  </span>
                </div>
              </div>
            );
          }

          return (
            <div
              key={lane}
              className={`kanban-lane ${isDragOver ? 'drag-over' : ''}`}
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
              onDragEnter={e => handleDragEnter(e, lane)}
              onDragLeave={e => handleDragLeave(e, lane)}
              onDrop={e => handleDrop(e, lane)}
            >
              {/* Lane Header */}
              <div className="kanban-lane-header">
                <button
                  className="kanban-lane-collapse-trigger"
                  onClick={() => toggleCollapse(lane)}
                  title="Collapse column"
                >
                  <ChevronDown size={14} />
                </button>

                <div
                  className="kanban-lane-badge-wrap"
                  onClick={() => toggleCollapse(lane)}
                >
                  <span
                    className="kanban-lane-badge"
                    style={{
                      background: badgeStyle.background,
                      color: badgeStyle.color,
                      borderColor: badgeStyle.borderColor,
                    }}
                  >
                    {lane}
                  </span>
                </div>

                <span className="kanban-lane-count">{laneEntries.length}</span>
              </div>

              {/* Lane Body */}
              <div className="kanban-lane-body">
                {laneEntries.length === 0 && (
                  <div className="kanban-lane-empty">
                    {isDragOver ? 'Drop card here' : 'No records'}
                  </div>
                )}

                {laneEntries.map(entry => {
                  const firstColVal = columns[0] ? entry.cells?.[columns[0].id.toString()] : '';
                  const rowLabel = firstColVal && firstColVal.trim() !== String(entry.rowNumber)
                    ? firstColVal.trim()
                    : `Record #${entry.rowNumber}`;

                  return (
                    <div
                      key={entry.id}
                      className={`kanban-card ${dragState?.entryId === entry.id ? 'dragging' : ''}`}
                      draggable={canEdit}
                      onDragStart={e => handleDragStart(e, entry, lane)}
                      onDragEnd={handleDragEnd}
                      onClick={() => onEntryClick(entry)}
                    >
                      {canEdit && (
                        <div className="kanban-card-grip" title="Drag to reorder/move">
                          <GripVertical size={13} />
                        </div>
                      )}

                      <div className="kanban-card-content">
                        {/* Card Top Title Row */}
                        <div className="kanban-card-topbar">
                          <span className="kanban-card-tag">#{entry.rowNumber}</span>
                          <span className="kanban-card-heading">{rowLabel}</span>
                        </div>

                        {/* Preview Columns */}
                        <div className="kanban-card-fields">
                          {displayCols.map(col => {
                            const val = entry.cells?.[col.id.toString()] || '';
                            if (!val) return null;

                            return (
                              <div key={col.id} className="kanban-card-field-row">
                                <span className="kanban-field-name">{col.name}:</span>
                                <span className="kanban-field-value">
                                  {col.type === 'dropdown' || col.type === 'status' || col.type === 'yes_no' ? (
                                    <span
                                      className="kanban-field-pill"
                                      style={{
                                        ...getOptionBadgeStyle(col, val),
                                        border: `1px solid ${getOptionBadgeStyle(col, val).borderColor}`,
                                      }}
                                    >
                                      {val}
                                    </span>
                                  ) : col.type === 'currency' ? (
                                    `₹${val}`
                                  ) : col.type === 'rating' ? (
                                    '⭐'.repeat(Math.min(Number(val) || 0, 5))
                                  ) : col.type === 'checkbox' ? (
                                    val === 'true' || val === '1' ? '☑ Yes' : '☐ No'
                                  ) : (
                                    val.substring(0, 45)
                                  )}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Add Record in Lane */}
                {canEdit && onAddEntry && (
                  <button className="kanban-add-card-btn" onClick={onAddEntry}>
                    <Plus size={13} />
                    <span>Add Record</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        .kanban-container {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 120px);
          background: #f8fafc;
          overflow: hidden;
        }

        /* ── Header ── */
        .kanban-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 20px;
          border-bottom: 1px solid #e2e8f0;
          background: white;
          flex-shrink: 0;
        }
        .kanban-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .kanban-header-label {
          font-size: 11px;
          font-weight: 800;
          color: #64748b;
          letter-spacing: 0.06em;
        }
        .kanban-group-by-btn {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 6px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          background: white;
          color: #0f172a;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
        }
        .kanban-group-by-btn:hover {
          border-color: #1a73e8;
          color: #1a73e8;
          background: rgba(26,115,232,0.02);
        }
        .kanban-group-by-name {
          text-transform: uppercase;
        }
        .kanban-header-actions {
          display: flex;
          align-items: center;
        }
        .kanban-toggle-all-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 5px 10px;
          border: 1px solid transparent;
          border-radius: 6px;
          background: transparent;
          color: #64748b;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }
        .kanban-toggle-all-btn:hover {
          background: #f1f5f9;
          color: #0f172a;
        }
        .kanban-stat {
          font-size: 12px;
          color: #64748b;
          font-weight: 600;
        }

        /* ── Dropdown Picker ── */
        .kanban-picker-backdrop {
          position: fixed;
          inset: 0;
          z-index: 999;
        }
        .kanban-picker-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          z-index: 1000;
          background: white;
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          box-shadow: 0 12px 36px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.06);
          padding: 8px;
          min-width: 230px;
          max-width: 300px;
          animation: dropIn 0.15s ease-out;
          display: flex;
          flex-direction: column;
        }
        @keyframes dropIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .kanban-picker-title {
          font-size: 11px;
          font-weight: 800;
          color: #94a3b8;
          padding: 4px 8px 6px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .kanban-picker-search-wrap {
          padding: 2px 4px 8px;
        }
        .kanban-picker-search {
          width: 100%;
          padding: 6px 10px;
          border-radius: 6px;
          border: 1px solid #cbd5e1;
          font-size: 12px;
          outline: none;
          background: #f8fafc;
          box-sizing: border-box;
          font-weight: 500;
        }
        .kanban-picker-search:focus {
          border-color: #1a73e8;
          background: white;
          box-shadow: 0 0 0 2px rgba(26,115,232,0.1);
        }
        .kanban-picker-list {
          max-height: 250px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding-right: 2px;
        }
        .kanban-picker-item {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 8px 10px;
          border: none;
          border-radius: 8px;
          background: transparent;
          color: #334155;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.1s;
          text-align: left;
        }
        .kanban-picker-item:hover {
          background: #f1f5f9;
          color: #0f172a;
        }
        .kanban-picker-item.active {
          background: rgba(26,115,232,0.08);
          color: #1a73e8;
        }
        .kanban-picker-check {
          margin-left: auto;
          font-weight: 800;
        }

        /* ── Board ── */
        .kanban-board {
          display: flex;
          gap: 16px;
          padding: 18px 20px;
          overflow-x: auto;
          overflow-y: hidden;
          flex: 1;
          min-height: 0;
          -webkit-overflow-scrolling: touch;
        }

        /* ── Normal Lane ── */
        .kanban-lane {
          flex: 0 0 300px;
          max-width: 320px;
          min-width: 280px;
          display: flex;
          flex-direction: column;
          background: #f1f5f9;
          border-radius: 14px;
          border: 1px solid #e2e8f0;
          transition: border-color 0.2s, box-shadow 0.2s;
          max-height: 100%;
        }
        .kanban-lane.drag-over {
          border-color: #1a73e8;
          background: rgba(26,115,232,0.04);
          box-shadow: 0 0 0 2px rgba(26,115,232,0.2);
        }

        .kanban-lane-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 14px;
          border-bottom: 1px solid #e2e8f0;
          background: white;
          border-top-left-radius: 13px;
          border-top-right-radius: 13px;
        }
        .kanban-lane-collapse-trigger {
          border: none;
          background: transparent;
          color: #64748b;
          cursor: pointer;
          padding: 2px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .kanban-lane-collapse-trigger:hover {
          background: #f1f5f9;
          color: #0f172a;
        }
        .kanban-lane-badge-wrap {
          flex: 1;
          min-width: 0;
          cursor: pointer;
          overflow: hidden;
        }
        .kanban-lane-badge {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
          border: 1px solid transparent;
          text-transform: uppercase;
        }
        .kanban-lane-count {
          font-size: 11px;
          font-weight: 800;
          color: #475569;
          background: #e2e8f0;
          padding: 2px 8px;
          border-radius: 12px;
          flex-shrink: 0;
        }

        /* ── Collapsed Lane ── */
        .kanban-lane.collapsed {
          flex: 0 0 44px;
          min-width: 44px;
          max-width: 44px;
          cursor: pointer;
          background: white;
          border: 1px dashed #cbd5e1;
          padding: 10px 4px;
          align-items: center;
          gap: 12px;
          border-radius: 14px;
          transition: all 0.15s;
        }
        .kanban-lane.collapsed:hover {
          border-color: #1a73e8;
          background: rgba(26,115,232,0.02);
        }
        .kanban-collapsed-top {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }
        .kanban-collapsed-btn {
          border: none;
          background: transparent;
          color: #64748b;
          cursor: pointer;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .kanban-collapsed-count {
          font-size: 11px;
          font-weight: 800;
          color: #475569;
          background: #e2e8f0;
          padding: 2px 6px;
          border-radius: 10px;
        }
        .kanban-collapsed-label-rail {
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          display: flex;
          align-items: center;
          justify-content: center;
          flex: 1;
          padding: 8px 0;
        }
        .kanban-collapsed-badge {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
          padding: 6px 4px;
          border-radius: 8px;
          border: 1px solid transparent;
          text-transform: uppercase;
          white-space: nowrap;
        }

        /* ── Lane Body & Cards ── */
        .kanban-lane-body {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 12px;
          overflow-y: auto;
          flex: 1;
          min-height: 80px;
        }
        .kanban-lane-empty {
          padding: 24px 12px;
          text-align: center;
          font-size: 12px;
          color: #94a3b8;
          font-weight: 600;
          border: 2px dashed #cbd5e1;
          border-radius: 10px;
          background: rgba(255,255,255,0.6);
        }

        .kanban-card {
          display: flex;
          gap: 8px;
          padding: 12px 14px;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 1px 3px rgba(0,0,0,0.03);
          position: relative;
        }
        .kanban-card:hover {
          border-color: #1a73e8;
          box-shadow: 0 4px 14px rgba(0,0,0,0.07);
          transform: translateY(-2px);
        }
        .kanban-card.dragging {
          opacity: 0.35;
          transform: rotate(2deg);
        }

        .kanban-card-grip {
          color: #cbd5e1;
          cursor: grab;
          flex-shrink: 0;
          padding-top: 2px;
          display: flex;
        }
        .kanban-card-grip:active {
          cursor: grabbing;
        }

        .kanban-card-content {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .kanban-card-topbar {
          display: flex;
          align-items: baseline;
          gap: 6px;
        }
        .kanban-card-tag {
          font-size: 10px;
          font-weight: 800;
          color: #94a3b8;
          background: #f1f5f9;
          padding: 1px 6px;
          border-radius: 6px;
          flex-shrink: 0;
        }
        .kanban-card-heading {
          font-size: 13px;
          font-weight: 700;
          color: #0f172a;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .kanban-card-fields {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .kanban-card-field-row {
          display: flex;
          align-items: baseline;
          gap: 6px;
          font-size: 11px;
        }
        .kanban-field-name {
          color: #94a3b8;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.02em;
          flex-shrink: 0;
        }
        .kanban-field-value {
          color: #334155;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .kanban-field-pill {
          padding: 1px 7px;
          border-radius: 12px;
          font-size: 10px;
          font-weight: 700;
        }

        .kanban-add-card-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px;
          border: 1px dashed #cbd5e1;
          border-radius: 8px;
          background: white;
          color: #64748b;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          margin-top: 4px;
        }
        .kanban-add-card-btn:hover {
          border-color: #1a73e8;
          color: #1a73e8;
          background: rgba(26,115,232,0.04);
        }

        /* ── Responsive ── */
        @media (max-width: 768px) {
          .kanban-board {
            padding: 12px 10px;
            gap: 10px;
          }
          .kanban-lane {
            flex: 0 0 270px;
            min-width: 250px;
          }
        }
      `}</style>
    </div>
  );
}
