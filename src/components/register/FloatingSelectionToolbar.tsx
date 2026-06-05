import React from 'react';
import { CheckSquare, Download, FileText, Trash2, X } from 'lucide-react';

interface FloatingSelectionToolbarProps {
  selectedRows: Set<number>;
  setSelectedRows: (val: Set<number>) => void;
  columns: any[];
  hiddenColumns: Set<number>;
  downloadableColumnIds: Set<number> | null;
  isPreviewSelectedColumns: boolean;
  selectedColumns: Set<number>;
  handleExportExcel: (args: any) => void;
  handleExportPDF: (args: any) => void;
  bulkDeleteMutation: { mutate: (ids: number[]) => void };
}

export function FloatingSelectionToolbar({
  selectedRows,
  setSelectedRows,
  columns,
  hiddenColumns,
  downloadableColumnIds,
  isPreviewSelectedColumns,
  selectedColumns,
  handleExportExcel,
  handleExportPDF,
  bulkDeleteMutation
}: FloatingSelectionToolbarProps) {
  if (selectedRows.size === 0) return null;

  return (
    <div className="selection-toolbar">
      <div className="selection-toolbar-info">
        <CheckSquare size={16} />
        <span><strong>{selectedRows.size}</strong> row{selectedRows.size > 1 ? 's' : ''} selected</span>
      </div>
      <div className="selection-toolbar-actions">
        <button
          className="selection-toolbar-btn excel"
          onClick={() => {
            const targetColIds = columns
              .filter(c => {
                if (hiddenColumns.has(c.id)) return false;
                if (c.type === 'image') return false;
                if (downloadableColumnIds && !downloadableColumnIds.has(c.id)) return false;
                if (isPreviewSelectedColumns && selectedColumns.size > 0 && !selectedColumns.has(c.id)) return false;
                return true;
              })
              .map(c => c.id);
            handleExportExcel({
              format: 'excel',
              exportRows: 'selected',
              selectedColumnIds: new Set(targetColIds),
              includeHeading: true,
              includeDateTime: false,
            });
          }}
        >
          <Download size={14} /> Excel
        </button>
        <button
          className="selection-toolbar-btn pdf"
          onClick={() => {
            const targetColIds = columns
              .filter(c => {
                if (hiddenColumns.has(c.id)) return false;
                if (c.type === 'image') return false;
                if (downloadableColumnIds && !downloadableColumnIds.has(c.id)) return false;
                if (isPreviewSelectedColumns && selectedColumns.size > 0 && !selectedColumns.has(c.id)) return false;
                return true;
              })
              .map(c => c.id);
            handleExportPDF({
              format: 'pdf',
              exportRows: 'selected',
              selectedColumnIds: new Set(targetColIds),
              includeHeading: true,
              includeDateTime: false,
            });
          }}
        >
          <FileText size={14} /> PDF
        </button>
        <button
          className="selection-toolbar-btn delete"
          onClick={() => {
            if (confirm(`Delete ${selectedRows.size} selected row(s)?`)) {
              bulkDeleteMutation.mutate(Array.from(selectedRows));
            }
          }}
        >
          <Trash2 size={14} /> Delete
        </button>
        <button
          className="selection-toolbar-btn clear"
          onClick={() => setSelectedRows(new Set())}
          title="Clear selection"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
