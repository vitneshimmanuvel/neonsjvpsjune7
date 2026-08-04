import React, { useState, useMemo } from 'react';
import { 
  Clock, FileText, Download, X, Plus, AlertCircle, 
  Image as ImageIcon, FlaskConical, ChevronDown, Maximize2, 
  ListOrdered, Globe, Phone, Mail,
  Link as LinkIcon, Lock as LockIcon, PenTool, Paperclip, ZoomIn, ZoomOut, Eraser
} from 'lucide-react';
import { type Entry, listRowHistory, updateEntry } from '../../../lib/api';
import { ImageCompressionModule } from '../../../lib/imageCompressionModule';
import { SignatureModal } from './SignatureModal';
import toast from 'react-hot-toast';

interface RowDetailModalProps {
  detailViewEntry: Entry;
  setDetailViewEntry: (entry: Entry | null) => void;
  _canEditAny: boolean;
  _rowEditRange?: { start?: number; end?: number } | null;
  _canDownloadAny: boolean;
  rowDownloadRange?: { start?: number; end?: number } | null;
  localEntries: Entry[];
  setLocalEntries: React.Dispatch<React.SetStateAction<Entry[]>>;
  registerId: number;
  columns: any[];
  isPreviewSelectedColumns: boolean;
  selectedColumns: Set<number>;
  _editableColumnIds?: Set<number> | null;
  columnSuggestions: Record<string, string[]>;
  uploadingCells: Record<string, boolean>;
  setUploadingCells: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setUploadingImagesCount: React.Dispatch<React.SetStateAction<number>>;
  setPreviewImage: (preview: { url: string; entryId: number; colId: string } | null) => void;
  evaluateFormula: (formula: string, entry: any, columns: any[]) => string;
  validateCellValue: (col: any, val: string) => { isValid: boolean; error: string | null };
  handleCellChange: (entryId: number, columnId: string, value: string) => void | boolean | Promise<any>;
  handleRowDownloadPDF: (entryId: number) => void;
  handleRowDownloadExcel: (entryId: number) => void;
  handleImageDownload: (url: string) => void;
  setActiveModalColId: (id: number | null) => void;
  setChangeTypeValue: (type: string) => void;
  setChangeTypeModal: (open: boolean) => void;
  setNewColFormula: (formula: string) => void;
  setNewColDropdownOpts: (opts: string) => void;
  setNewColMinVal: (v: string) => void;
  setNewColMaxVal: (v: string) => void;
  openDropdown: (entryId: number, columnId: number, options: string[], rect: DOMRect) => void;
  openDatePicker: (entryId: number, columnId: number, value: string, rect: DOMRect) => void;
  canSelectBackDates?: boolean;
  queryClient: any;
  pendingTempRowEdits: React.MutableRefObject<Record<number, Record<string, string>>>;
  debounceTimers: React.MutableRefObject<Record<string, any>>;
  columnsRef: React.MutableRefObject<any[]>;
  localEntriesRef: React.MutableRefObject<Entry[]>;
  
  // Shared States passed from parent for decoupled syncing
  detailEdits: Record<string, string>;
  setDetailEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  detailErrors: Record<string, string | null>;
  setDetailErrors: React.Dispatch<React.SetStateAction<Record<string, string | null>>>;
  detailErrorsRef: React.MutableRefObject<Record<string, string | null>>;
  showRowAuditTrail: boolean;
  setShowRowAuditTrail: React.Dispatch<React.SetStateAction<boolean>>;
  rowAuditHistory: any[];
  setRowAuditHistory: React.Dispatch<React.SetStateAction<any[]>>;
  rowAuditLoading: boolean;
  setRowAuditLoading: React.Dispatch<React.SetStateAction<boolean>>;
  detailInputRefs: React.MutableRefObject<Map<number, HTMLElement>>;
}

export const RowDetailModal = React.memo(function RowDetailModal({
  detailViewEntry,
  setDetailViewEntry,
  _canEditAny,
  _rowEditRange,
  _canDownloadAny,
  rowDownloadRange,
  localEntries,
  setLocalEntries,
  registerId,
  columns,
  isPreviewSelectedColumns,
  selectedColumns,
  _editableColumnIds,
  columnSuggestions,
  uploadingCells,
  setUploadingCells,
  setUploadingImagesCount,
  setPreviewImage,
  evaluateFormula,
  validateCellValue,
  handleCellChange,
  handleRowDownloadPDF,
  handleRowDownloadExcel,
  handleImageDownload,
  setActiveModalColId,
  setChangeTypeValue,
  setChangeTypeModal,
  setNewColFormula,
  setNewColDropdownOpts,
  setNewColMinVal,
  setNewColMaxVal,
  openDropdown,
  openDatePicker,
  queryClient,
  pendingTempRowEdits,
  debounceTimers,
  columnsRef,
  localEntriesRef,
  
  detailEdits,
  setDetailEdits,
  detailErrors,
  setDetailErrors,
  detailErrorsRef,
  showRowAuditTrail,
  setShowRowAuditTrail,
  rowAuditHistory,
  setRowAuditHistory,
  rowAuditLoading,
  setRowAuditLoading,
  detailInputRefs
}: RowDetailModalProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [activeSignatureCol, setActiveSignatureCol] = useState<{ id: string; name: string; value: string } | null>(null);
  const [showAttachmentsGallery, setShowAttachmentsGallery] = useState(false);
  const [galleryZoomIdx, setGalleryZoomIdx] = useState<number | null>(null);

  const isRowEditable = !_canEditAny ? false : (!_rowEditRange ? true : (() => {
    const num = detailViewEntry.rowNumber;
    const { start, end } = _rowEditRange;
    if (start !== undefined && num < start) return false;
    if (end !== undefined && num > end) return false;
    return true;
  })());

  const isRowDownloadable = _canDownloadAny && (() => {
    if (!rowDownloadRange) return true;
    const num = detailViewEntry.rowNumber;
    const { start, end } = rowDownloadRange;
    if (start !== undefined && num < start) return false;
    if (end !== undefined && num > end) return false;
    return true;
  })();

  const modalColumns = useMemo(() => {
    return (isPreviewSelectedColumns && selectedColumns.size > 0)
      ? columns.filter(col => selectedColumns.has(col.id))
      : columns;
  }, [columns, isPreviewSelectedColumns, selectedColumns]);

  const handleDetailKeyDown = (e: React.KeyboardEvent, currentId: number) => {
    const currentIndex = modalColumns.findIndex(c => c.id === currentId);
    
    if (e.key === 'Enter' || (e.key === 'ArrowDown' && (e.target as HTMLElement).tagName !== 'SELECT')) {
      e.preventDefault();
      const nextCol = modalColumns[currentIndex + 1];
      if (nextCol) {
        detailInputRefs.current.get(nextCol.id)?.focus();
      }
    } else if (e.key === 'ArrowUp' && (e.target as HTMLElement).tagName !== 'SELECT') {
      e.preventDefault();
      const prevCol = modalColumns[currentIndex - 1];
      if (prevCol) {
        detailInputRefs.current.get(prevCol.id)?.focus();
      }
    }
  };

  return (
    <div className="row-detail-overlay" onClick={() => { setDetailViewEntry(null); setDetailEdits({}); setShowRowAuditTrail(false); setRowAuditHistory([]); }}>
      <div className="row-detail-modal" onClick={e => e.stopPropagation()}>
        <div className="row-detail-header">
          <div className="row-detail-title">
            <span className="row-detail-badge">Row #{(localEntries.findIndex(e => e.id === detailViewEntry.id) + 1)}</span>
            <h2>Record Details</h2>
            <button
              className="row-audit-trail-btn"
              title="View row change history"
              onClick={async () => {
                if (showRowAuditTrail) {
                  setShowRowAuditTrail(false);
                  return;
                }
                setShowRowAuditTrail(true);
                setRowAuditLoading(true);
                try {
                  const history = await listRowHistory(registerId, detailViewEntry.id);
                  setRowAuditHistory(history);
                } catch (err) {
                  console.error('Failed to load row history:', err);
                  setRowAuditHistory([]);
                } finally {
                  setRowAuditLoading(false);
                }
              }}
            >
              <Clock size={15} />
            </button>
            <button
              className="row-audit-trail-btn"
              title="View all attachments (images & signatures)"
              style={{ color: showAttachmentsGallery ? 'var(--primary)' : undefined }}
              onClick={() => setShowAttachmentsGallery(!showAttachmentsGallery)}
            >
              <Paperclip size={15} />
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isRowDownloadable && (
              <button
                className="pab-tab-action-btn"
                style={{ borderColor: '#fca5a5', color: '#dc2626' }}
                onClick={() => handleRowDownloadPDF(detailViewEntry.id)}
                title="Download PDF"
              >
                <FileText size={14} /> PDF
              </button>
            )}
            {isRowDownloadable && (
              <button
                className="pab-tab-action-btn"
                style={{ borderColor: '#86efac', color: '#16a34a' }}
                onClick={() => handleRowDownloadExcel(detailViewEntry.id)}
                title="Download Excel"
              >
                <Download size={14} /> Excel
              </button>
            )}
            <button className="row-detail-close" onClick={() => { setDetailViewEntry(null); setDetailEdits({}); setShowRowAuditTrail(false); setRowAuditHistory([]); }} aria-label="Close">✕</button>
          </div>
        </div>



        <div className="row-detail-body">
          {modalColumns.map((col) => {
            const colKey = col.id.toString();
            const val = detailEdits[colKey] ?? '';
            const isTargetLinked = col.linkedTo && col.linkedTo.role === 'target';
            const isFieldEditable = isRowEditable && (!_editableColumnIds || _editableColumnIds.has(col.id)) && col.type !== 'auto_increment' && col.type !== 'formula' && !isTargetLinked;

            return (
              <div className={`row-detail-field ${col.type}-field`} key={col.id}>
                <div className="row-detail-label-container">
                  <div className="row-detail-label-group">
                    <label className="row-detail-label">
                      {col.name}
                      {col.type === 'formula' && <FlaskConical size={10} style={{ marginLeft: 4, opacity: 0.6 }} />}
                      {col.linkedTo && (
                        <span 
                          title={isTargetLinked 
                            ? "Linked column (To) — Read-only data synced from source register" 
                            : "Linked column (From) — Sends data to destination register"}
                          style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 6, gap: 2 }}
                        >
                          <LinkIcon size={12} color="var(--primary)" style={{ verticalAlign: 'middle' }} />
                          {isTargetLinked && (
                            <LockIcon size={10} color="#dc2626" style={{ verticalAlign: 'middle' }} />
                          )}
                        </span>
                      )}
                    </label>
                    <span className="row-detail-type-badge">{col.type.replace('_', ' ')}</span>
                  </div>
                  {_canEditAny && (
                    <button 
                      className="row-detail-col-btn" 
                      title="Column Settings"
                      onClick={() => {
                        setActiveModalColId(col.id);
                        setChangeTypeValue(col.type);
                        if (col.type === 'formula') setNewColFormula(col.formula || '');
                        if (col.type === 'dropdown') setNewColDropdownOpts((col.dropdownOptions || []).join(', '));
                        setNewColMinVal((col as any).minVal != null ? (col as any).minVal.toString() : '');
                        setNewColMaxVal((col as any).maxVal != null ? (col as any).maxVal.toString() : '');
                        setChangeTypeModal(true);
                      }}
                    >
                      <ChevronDown size={12} />
                    </button>
                  )}
                </div>
                
                <div className="row-detail-input-wrapper">
                  {col.type === 'dropdown' ? (
                    <div className="row-detail-input-wrapper">
                      <div 
                        className={`row-detail-input cell-dropdown ${detailErrors[colKey] ? 'invalid' : ''} ${!isFieldEditable ? 'cell-readonly' : ''}`}
                        tabIndex={isFieldEditable ? 0 : -1}
                        ref={(el) => {
                          if (el) detailInputRefs.current.set(col.id, el);
                          else detailInputRefs.current.delete(col.id);
                        }}
                        onKeyDown={(e) => {
                          if (!isFieldEditable) {
                            handleDetailKeyDown(e, col.id);
                            return;
                          }
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            openDropdown(detailViewEntry.id, col.id, col.dropdownOptions || [], rect as DOMRect);
                          } else handleDetailKeyDown(e, col.id);
                        }}
                        onClick={isFieldEditable ? (e) => {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          openDropdown(detailViewEntry.id, col.id, col.dropdownOptions || [], rect as DOMRect);
                          if (detailErrors[colKey]) setDetailErrors(prev => ({ ...prev, [colKey]: null }));
                        } : undefined}
                      >
                        {val || 'Select options...'}
                      </div>
                      {detailErrors[colKey] && (
                        <div className="row-detail-error-msg">
                          <AlertCircle size={10} />
                          {detailErrors[colKey]}
                        </div>
                      )}
                    </div>
                  ) : col.type === 'checkbox' ? (
                    <div 
                      className={`row-detail-checkbox-wrapper ${!isFieldEditable ? 'cell-readonly' : ''}`}
                      tabIndex={isFieldEditable ? 0 : -1}
                      ref={(el) => {
                        if (el) detailInputRefs.current.set(col.id, el);
                        else detailInputRefs.current.delete(col.id);
                      }}
                      onKeyDown={(e) => {
                        if (!isFieldEditable) {
                          handleDetailKeyDown(e, col.id);
                          return;
                        }
                        if (e.key === ' ') {
                          e.preventDefault();
                          setDetailEdits(prev => ({ ...prev, [colKey]: (val === 'true' || val === 'Checked') ? 'false' : 'true' }));
                        } else {
                          handleDetailKeyDown(e, col.id);
                        }
                      }}
                      onClick={isFieldEditable ? () => setDetailEdits(prev => ({ ...prev, [colKey]: (val === 'true' || val === 'Checked') ? 'false' : 'true' })) : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={val === 'true' || val === 'Checked'}
                        disabled={!isFieldEditable}
                        readOnly
                      />
                      <span className="checkbox-label">{val === 'true' || val === 'Checked' ? 'Checked' : 'Unchecked'}</span>
                    </div>
                  ) : col.type === 'date' ? (
                    <div className="row-detail-input-wrapper">
                      <input 
                        type="text"
                        className={`row-detail-input cell-date ${detailErrors[colKey] ? 'invalid' : ''} ${!isFieldEditable ? 'cell-readonly' : ''}`} 
                        value={val}
                        placeholder={isFieldEditable ? "DD-MM-YYYY" : "—"}
                        autoComplete="off"
                        readOnly={true}
                        style={{ cursor: isFieldEditable ? 'pointer' : 'default' }}
                        onChange={(e) => {
                          if (!isFieldEditable) return;
                          setDetailEdits(prev => ({ ...prev, [colKey]: e.target.value }));
                          if (detailErrors[colKey]) setDetailErrors(prev => ({ ...prev, [colKey]: null }));
                        }}
                        onClick={isFieldEditable ? (e) => {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          openDatePicker(detailViewEntry.id, col.id, val, rect as DOMRect);
                        } : undefined}
                        onKeyDown={(e) => {
                          e.preventDefault();
                          if ((e.key === 'Enter' || e.key === ' ') && isFieldEditable) {
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            openDatePicker(detailViewEntry.id, col.id, val, rect as DOMRect);
                          }
                        }}
                        ref={(el) => {
                          if (el) detailInputRefs.current.set(col.id, el);
                          else detailInputRefs.current.delete(col.id);
                        }}
                      />
                      {detailErrors[colKey] && (
                        <div className="row-detail-error-msg">
                          <AlertCircle size={10} />
                          {detailErrors[colKey]}
                        </div>
                      )}
                    </div>
                  ) : col.type === 'image' ? (
                    <div className="row-detail-image-field">
                      {val ? (
                        <div className="row-detail-image-container">
                          <div className="row-detail-img-wrapper" onClick={() => setPreviewImage({ url: val, entryId: detailViewEntry.id, colId: col.id.toString() })}>
                            <img 
                              src={val.split('|||')[0]} 
                              alt="preview" 
                              className="row-detail-img-preview" 
                            />
                            {val.split('|||').length > 1 && (
                              <div className="cell-image-count-badge" style={{ position: 'absolute', top: 5, right: 5, background: 'rgba(0,0,0,0.6)', color: 'white', padding: '2px 6px', borderRadius: '10px', fontSize: '10px', zIndex: 2 }}>
                                +{val.split('|||').length - 1}
                              </div>
                            )}
                            <div className="row-detail-img-overlay">
                              <Maximize2 size={24} color="white" />
                              <span>Quick Reveal</span>
                            </div>
                          </div>
                          <div className="row-detail-image-actions">
                            <button className="row-detail-img-btn" onClick={() => setPreviewImage({ url: val, entryId: detailViewEntry.id, colId: col.id.toString() })}>View Large</button>
                            {val.split('|||').length === 1 && <button className="row-detail-img-btn" onClick={() => handleImageDownload(val.split('|||')[0])}>Download</button>}
                            {isFieldEditable && <button className="row-detail-img-btn danger" onClick={() => handleCellChange(detailViewEntry.id, colKey, '')}>Remove All</button>}
                          </div>
                          
                          {isFieldEditable && (
                            uploadingCells[colKey] ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', padding: '6px', marginTop: '8px' }}>
                                <div className="spinner" style={{ width: '14px', height: '14px', border: '2px solid rgba(0,0,0,0.1)', borderLeftColor: 'var(--primary)' }} />
                                <span style={{ fontSize: '13px', fontWeight: 500 }}>Adding another photo...</span>
                              </div>
                            ) : (
                              <label className="row-detail-add-btn">
                                <input 
                                  type="file" 
                                  accept="image/*" 
                                  hidden 
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      console.log(`[Detail View - Image Selected] Selected file for row #${detailViewEntry.id}, column #${colKey}:`, file.name, `${(file.size / 1024).toFixed(1)} KB`);
                                      setUploadingCells(prev => ({ ...prev, [colKey]: true }));
                                      setUploadingImagesCount(prev => prev + 1);
                                      console.log(`[Detail View - Image Upload] Starting compression & upload...`);
                                      ImageCompressionModule.compressAndUploadImage(file, registerId, detailViewEntry.id, colKey)
                                        .then(async (newImg) => {
                                          console.log(`[Detail View - Image Upload] Upload / Compression succeeded. Persisting to database...`);
                                          const current = detailEdits[colKey] ?? '';
                                          const updated = current ? `${current}|||${newImg}` : newImg;
                                          const res = handleCellChange(detailViewEntry.id, colKey, updated);
                                          if (res === false) throw new Error("Cell change rejected");
                                          await res;
                                        })
                                        .then(() => {
                                          console.log(`[Detail View - Image Upload] PERSISTED successfully to database for row #${detailViewEntry.id}, column #${colKey}!`);
                                        })
                                        .catch(err => {
                                          console.error(`[Detail View - Image Upload] FAILED for row #${detailViewEntry.id}, column #${colKey}:`, err);
                                        })
                                        .finally(() => {
                                          setUploadingCells(prev => ({ ...prev, [colKey]: false }));
                                          setUploadingImagesCount(prev => Math.max(0, prev - 1));
                                        });
                                    }
                                  }}
                                />
                                <Plus size={14} />
                                <span>Add Another Image</span>
                              </label>
                            )
                          )}
                        </div>
                      ) : (
                        uploadingCells[colKey] ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', padding: '6px' }}>
                            <div className="spinner" style={{ width: '14px', height: '14px', border: '2px solid rgba(0,0,0,0.1)', borderLeftColor: 'var(--primary)' }} />
                            <span style={{ fontSize: '13px', fontWeight: 500 }}>Compressing & uploading photo...</span>
                          </div>
                        ) : isFieldEditable ? (
                          <label className="row-detail-image-upload">
                            <input 
                              type="file" 
                              accept="image/*" 
                              hidden 
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  console.log(`[Detail View - Image Selected] Selected file for row #${detailViewEntry.id}, column #${colKey}:`, file.name, `${(file.size / 1024).toFixed(1)} KB`);
                                  setUploadingCells(prev => ({ ...prev, [colKey]: true }));
                                  setUploadingImagesCount(prev => prev + 1);
                                  console.log(`[Detail View - Image Upload] Starting compression & upload...`);
                                  ImageCompressionModule.compressAndUploadImage(file, registerId, detailViewEntry.id, colKey)
                                    .then(async (newImg) => {
                                      console.log(`[Detail View - Image Upload] Upload / Compression succeeded. Persisting to database...`);
                                      const res = handleCellChange(detailViewEntry.id, colKey, newImg);
                                      if (res === false) throw new Error("Cell change rejected");
                                      await res;
                                    })
                                    .then(() => {
                                      console.log(`[Detail View - Image Upload] PERSISTED successfully to database for row #${detailViewEntry.id}, column #${colKey}!`);
                                    })
                                    .catch(err => {
                                      console.error(`[Detail View - Image Upload] FAILED for row #${detailViewEntry.id}, column #${colKey}:`, err);
                                    })
                                    .finally(() => {
                                      setUploadingCells(prev => ({ ...prev, [colKey]: false }));
                                      setUploadingImagesCount(prev => Math.max(0, prev - 1));
                                    });
                                }
                              }}
                            />
                            <ImageIcon size={16} />
                            <span>Upload Image</span>
                          </label>
                        ) : (
                          <div className="row-detail-input auto-increment-readonly" style={{ opacity: 0.5 }}>
                            <ImageIcon size={16} style={{ marginRight: 6 }} />
                            <span>No image</span>
                          </div>
                        )
                      )}
                    </div>
                  ) : col.type === 'signature' ? (
                    <div className="row-detail-image-field">
                      {val ? (
                        <div className="row-detail-image-container">
                          <div 
                            className="row-detail-img-wrapper" 
                            onClick={() => isFieldEditable && setActiveSignatureCol({ id: colKey, name: col.name, value: val })}
                            style={{ background: '#ffffff', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <img src={val} alt="Signature" style={{ maxHeight: '100px', maxWidth: '100%', objectFit: 'contain' }} />
                          </div>
                          <div className="row-detail-image-actions">
                            {isFieldEditable && (
                              <button 
                                className="row-detail-img-btn" 
                                onClick={() => setActiveSignatureCol({ id: colKey, name: col.name, value: val })}
                              >
                                Re-sign Signature
                              </button>
                            )}
                            <button className="row-detail-img-btn" onClick={() => handleImageDownload(val)}>Download PNG</button>
                            {isFieldEditable && (
                              <button className="row-detail-img-btn danger" onClick={() => handleCellChange(detailViewEntry.id, colKey, '')}>
                                Clear Signature
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        isFieldEditable ? (
                          <button 
                            className="row-detail-add-btn" 
                            style={{ padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', cursor: 'pointer' }}
                            onClick={() => setActiveSignatureCol({ id: colKey, name: col.name, value: '' })}
                          >
                            <PenTool size={16} />
                            <span>Draw Signature</span>
                          </button>
                        ) : (
                          <div className="row-detail-input auto-increment-readonly" style={{ opacity: 0.5 }}>
                            <PenTool size={16} style={{ marginRight: 6 }} />
                            <span>No signature</span>
                          </div>
                        )
                      )}
                    </div>
                  ) : col.type === 'formula' ? (
                    <div 
                      className="row-detail-formula-result"
                      tabIndex={0}
                      ref={(el) => {
                        if (el) detailInputRefs.current.set(col.id, el);
                        else detailInputRefs.current.delete(col.id);
                      }}
                      onKeyDown={(e) => handleDetailKeyDown(e, col.id)}
                      onClick={_canEditAny ? () => {
                        setActiveModalColId(col.id);
                        setNewColFormula(col.formula || '');
                        setChangeTypeValue(col.type);
                        setNewColMinVal((col as any).minVal != null ? (col as any).minVal.toString() : '');
                        setNewColMaxVal((col as any).maxVal != null ? (col as any).maxVal.toString() : '');
                        setChangeTypeModal(true);
                      } : undefined}
                      title={_canEditAny ? "Click to edit formula" : undefined}
                    >
                      {evaluateFormula(col.formula || '', { ...detailViewEntry, cells: { ...detailViewEntry.cells, ...detailEdits } }, columns)}
                    </div>
                  ) : col.type === 'auto_increment' ? (
                    <div className="row-detail-input auto-increment-readonly">
                      <ListOrdered size={14} style={{ opacity: 0.5 }} />
                      <span>{val || '–'}</span>
                    </div>
                  ) : (
                    <div className="row-detail-input-wrapper">
                      <input
                        className={`row-detail-input ${detailErrors[colKey] ? 'invalid' : ''} ${!isFieldEditable ? 'cell-readonly' : ''}`}
                        value={val}
                        readOnly={!isFieldEditable}
                        ref={(el) => {
                          if (el) detailInputRefs.current.set(col.id, el);
                          else detailInputRefs.current.delete(col.id);
                        }}
                        onKeyDown={(e) => handleDetailKeyDown(e, col.id)}
                        onChange={e => {
                          if (!isFieldEditable) return;
                          setDetailEdits(prev => ({ ...prev, [colKey]: e.target.value }));
                          if (detailErrors[colKey]) setDetailErrors(prev => ({ ...prev, [colKey]: null }));
                        }}
                        placeholder={isFieldEditable ? `Enter ${col.name}…` : '—'}
                        type={col.type === 'email' ? 'email' : col.type === 'phone' ? 'tel' : 'text'}
                        inputMode={col.type === 'number' || col.type === 'currency' ? 'decimal' : undefined}
                        list={isFieldEditable ? `list-detail-${col.id}` : undefined}
                      />
                      {isFieldEditable && columnSuggestions[col.id.toString()]?.length > 0 && (
                        <datalist id={`list-detail-${col.id}`}>
                          {columnSuggestions[col.id.toString()].map((s, i) => (
                            <option key={`${s}-${i}`} value={s} />
                          ))}
                        </datalist>
                      )}
                      {detailErrors[colKey] && (
                        <div className="row-detail-error-msg">
                          <AlertCircle size={10} />
                          {detailErrors[colKey]}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="row-detail-footer">
          <button className="row-detail-btn-close" onClick={() => { setDetailViewEntry(null); setDetailEdits({}); setDetailErrors({}); setShowRowAuditTrail(false); setRowAuditHistory([]); }}>{isRowEditable ? 'Cancel' : 'Close'}</button>
          {isRowEditable && (
            <button
              className="row-detail-btn-close"
              style={{ color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}
              title="Clear all field values in this row"
              onClick={() => {
                if (!confirm('Are you sure you want to clear all fields in this row? This will empty every editable field. You can still cancel without saving.')) return;
                const cleared: Record<string, string> = {};
                modalColumns.forEach(col => {
                  if (col.type === 'formula' || col.type === 'auto_increment') return;
                  const isTargetLinked = col.linkedTo && col.linkedTo.role === 'target';
                  if (isTargetLinked) return;
                  if (_editableColumnIds && !_editableColumnIds.has(col.id)) return;
                  cleared[col.id.toString()] = '';
                });
                setDetailEdits(prev => ({ ...prev, ...cleared }));
                setDetailErrors({});
                toast.success('All fields cleared. Click "Save Changes" to persist or "Cancel" to undo.');
              }}
            >
              <Eraser size={14} /> Clear All
            </button>
          )}
          {isRowEditable && (
            <button 
              className="row-detail-btn-save" 
              disabled={isSaving}
              onClick={async () => {
                const errors: Record<string, string | null> = {};
                let hasErrors = false;

                modalColumns.forEach(col => {
                  const val = detailEdits[col.id.toString()] ?? detailViewEntry.cells?.[col.id.toString()] ?? '';
                  
                  if ((col as any).mandatory && col.type !== 'formula' && col.type !== 'auto_increment' && val.trim() === '') {
                    errors[col.id.toString()] = "This field is mandatory and cannot be empty.";
                    hasErrors = true;
                  } else if ((col as any).unique && val.trim() !== '') {
                    const isDuplicate = localEntriesRef.current.some(
                      e => e.id !== detailViewEntry.id && e.cells?.[col.id.toString()]?.trim().toLowerCase() === val.trim().toLowerCase()
                    );
                    if (isDuplicate) {
                      errors[col.id.toString()] = `Unique field: The value "${val}" already exists.`;
                      hasErrors = true;
                    }
                  } 
                  
                  if (!errors[col.id.toString()]) {
                    const validation = validateCellValue(col, val);
                    if (!validation.isValid && val.trim() !== '') {
                      errors[col.id.toString()] = validation.error;
                      hasErrors = true;
                    }
                  }
                });

                const hadErrorsBefore = Object.keys(detailErrors || {}).length > 0;
                setDetailErrors(errors);

                if (hasErrors && !hadErrorsBefore) {
                  toast("Some entries have formatting warnings. Click save again to confirm.", { icon: '⚠️' });
                  return;
                }

                const changedCells: Record<string, string> = {};
                Object.entries(detailEdits).forEach(([colId, value]) => {
                  if (detailViewEntry.cells?.[colId] !== value) {
                    changedCells[colId] = value;
                  }
                });

                if (Object.keys(changedCells).length > 0) {
                  if (!Number.isInteger(detailViewEntry.id)) {
                    pendingTempRowEdits.current[detailViewEntry.id] = {
                      ...(pendingTempRowEdits.current[detailViewEntry.id] || {}),
                      ...changedCells
                    };
                    toast.success("Changes buffered. Saving to database once the row is created.");
                    
                    setDetailViewEntry(null);
                    setDetailEdits({});
                    setDetailErrors({});
                    setShowRowAuditTrail(false);
                    setRowAuditHistory([]);
                    return;
                  }

                  setLocalEntries(prev => prev.map(e => 
                    e.id === detailViewEntry.id ? { ...e, cells: { ...e.cells, ...changedCells } } : e
                  ));

                  Object.keys(changedCells).forEach(colId => {
                    const key = `${detailViewEntry.id}-${colId}`;
                    if (debounceTimers.current[key]) {
                      clearTimeout(debounceTimers.current[key]);
                      delete debounceTimers.current[key];
                    }
                  });

                  setIsSaving(true);
                  updateEntry(registerId, detailViewEntry.id, changedCells).then(() => {
                    Object.keys(changedCells).forEach(colId => {
                      const col = columnsRef.current.find(c => c.id.toString() === colId);
                      if (col?.linkedTo) {
                        queryClient.invalidateQueries({ queryKey: ['register', col.linkedTo.registerId] });
                      }
                    });
                    
                    queryClient.setQueryData(['register', registerId], (old: any) => {
                      if (!old) return old;
                      return {
                        ...old,
                        entries: old.entries.map((e: any) =>
                          e.id === detailViewEntry.id ? { ...e, cells: { ...e.cells, ...changedCells } } : e
                        ),
                      };
                    });
                    toast.success("Changes saved successfully!");
                  }).catch(err => {
                    console.error("Failed to save:", err);
                    toast.error("Failed to save changes. Please check your connection.");
                  }).finally(() => {
                    setIsSaving(false);
                  });
                } else {
                  toast.success("No changes to save.");
                }
                
                setDetailViewEntry(null);
                setDetailEdits({});
                setDetailErrors({});
                setShowRowAuditTrail(false);
                setRowAuditHistory([]);
              }}
            >
              Save Changes
            </button>
          )}
        </div>
      </div>

      {activeSignatureCol && (
        <SignatureModal
          isOpen={!!activeSignatureCol}
          onClose={() => setActiveSignatureCol(null)}
          onSave={(dataUrl) => {
            handleCellChange(detailViewEntry.id, activeSignatureCol.id, dataUrl);
            setActiveSignatureCol(null);
          }}
          initialSignature={activeSignatureCol.value}
          columnName={activeSignatureCol.name}
        />
      )}

      {showRowAuditTrail && (
        <div className="row-history-modal-overlay" onClick={() => setShowRowAuditTrail(false)}>
          <div className="row-history-modal" onClick={(e) => e.stopPropagation()}>
            <div className="row-history-modal-header">
              <div className="row-history-modal-title">
                <Clock size={16} />
                <span>Row Change History (Row #{localEntries.findIndex(e => e.id === detailViewEntry.id) + 1})</span>
              </div>
              <button className="row-history-modal-close" onClick={() => setShowRowAuditTrail(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="row-history-modal-body">
              {rowAuditLoading ? (
                <div className="row-history-loading">
                  <div className="row-audit-spinner" />
                  <span>Loading history…</span>
                </div>
              ) : rowAuditHistory.length === 0 ? (
                <div className="row-history-empty">
                  <Clock size={36} style={{ opacity: 0.25 }} />
                  <p>No change history found for this row.</p>
                </div>
              ) : (
                <div className="row-history-list">
                  {rowAuditHistory.map((h, idx) => (
                    <RowHistoryCard key={h.id} h={h} isLatest={idx === 0} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Attachments Gallery Panel ── */}
      {showAttachmentsGallery && (() => {
        const attachmentCols = modalColumns.filter(c => c.type === 'image' || c.type === 'signature');
        const attachments = attachmentCols.map(col => {
          const colKey = col.id.toString();
          const val = detailEdits[colKey] ?? '';
          const urls = val ? (col.type === 'image' ? val.split('|||').filter(Boolean) : [val]) : [];
          return { col, urls };
        }).filter(a => a.urls.length > 0);

        // Flat list for gallery zoom navigation
        const flatItems: { url: string; colName: string; colType: string }[] = [];
        attachments.forEach(a => {
          a.urls.forEach(url => {
            flatItems.push({ url, colName: a.col.name, colType: a.col.type });
          });
        });

        return (
          <div className="row-history-modal-overlay" onClick={() => { setShowAttachmentsGallery(false); setGalleryZoomIdx(null); }}>
            <div className="row-history-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '680px' }}>
              <div className="row-history-modal-header">
                <div className="row-history-modal-title">
                  <Paperclip size={16} />
                  <span>Attachments — Row #{localEntries.findIndex(e => e.id === detailViewEntry.id) + 1}</span>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '8px', fontWeight: 500 }}>
                    ({flatItems.length} file{flatItems.length !== 1 ? 's' : ''})
                  </span>
                </div>
                <button className="row-history-modal-close" onClick={() => { setShowAttachmentsGallery(false); setGalleryZoomIdx(null); }}>
                  <X size={18} />
                </button>
              </div>
              <div className="row-history-modal-body" style={{ padding: '16px' }}>
                {attachments.length === 0 ? (
                  <div className="row-history-empty">
                    <Paperclip size={36} style={{ opacity: 0.25 }} />
                    <p>No images or signatures found in this row.</p>
                  </div>
                ) : galleryZoomIdx !== null && flatItems[galleryZoomIdx] ? (
                  /* ── Zoomed Single Image View ── */
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <button
                        onClick={() => setGalleryZoomIdx(Math.max(0, galleryZoomIdx - 1))}
                        disabled={galleryZoomIdx === 0}
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 12px', cursor: galleryZoomIdx === 0 ? 'not-allowed' : 'pointer', opacity: galleryZoomIdx === 0 ? 0.4 : 1, fontSize: '12px', fontWeight: 600, color: 'var(--foreground)' }}
                      >← Prev</button>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)' }}>{flatItems[galleryZoomIdx].colName}</div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase' }}>{flatItems[galleryZoomIdx].colType} • {galleryZoomIdx + 1} / {flatItems.length}</div>
                      </div>
                      <button
                        onClick={() => setGalleryZoomIdx(Math.min(flatItems.length - 1, galleryZoomIdx + 1))}
                        disabled={galleryZoomIdx === flatItems.length - 1}
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 12px', cursor: galleryZoomIdx === flatItems.length - 1 ? 'not-allowed' : 'pointer', opacity: galleryZoomIdx === flatItems.length - 1 ? 0.4 : 1, fontSize: '12px', fontWeight: 600, color: 'var(--foreground)' }}
                      >Next →</button>
                    </div>
                    <div style={{
                      width: '100%', maxHeight: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: flatItems[galleryZoomIdx].colType === 'signature' ? '#ffffff' : 'var(--surface)',
                      borderRadius: '10px', border: '1px solid var(--border)', padding: '16px', overflow: 'hidden'
                    }}>
                      <img
                        src={flatItems[galleryZoomIdx].url}
                        alt={flatItems[galleryZoomIdx].colName}
                        style={{ maxWidth: '100%', maxHeight: '360px', objectFit: 'contain', borderRadius: '6px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleImageDownload(flatItems[galleryZoomIdx!].url)}
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '5px' }}
                      ><Download size={13} /> Download</button>
                      <button
                        onClick={() => setGalleryZoomIdx(null)}
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '5px' }}
                      ><ZoomOut size={13} /> Back to Grid</button>
                    </div>
                  </div>
                ) : (
                  /* ── Thumbnail Grid View ── */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {attachments.map(({ col, urls }) => (
                      <div key={col.id}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                          {col.type === 'image'
                            ? <ImageIcon size={14} color="var(--primary)" />
                            : <PenTool size={14} color="var(--primary)" />}
                          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)' }}>{col.name}</span>
                          <span style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', background: 'var(--surface)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>{col.type}</span>
                          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>({urls.length} file{urls.length !== 1 ? 's' : ''})</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px' }}>
                          {urls.map((url, i) => {
                            const globalIdx = flatItems.findIndex(fi => fi.url === url && fi.colName === col.name);
                            return (
                              <div
                                key={i}
                                onClick={() => setGalleryZoomIdx(globalIdx)}
                                style={{
                                  position: 'relative', cursor: 'pointer', borderRadius: '8px', overflow: 'hidden',
                                  border: '1.5px solid var(--border)', aspectRatio: '1', display: 'flex',
                                  alignItems: 'center', justifyContent: 'center',
                                  background: col.type === 'signature' ? '#ffffff' : 'var(--surface)',
                                  transition: 'all 0.15s'
                                }}
                              >
                                <img
                                  src={url}
                                  alt={`${col.name} ${i + 1}`}
                                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: col.type === 'signature' ? 'contain' : 'cover', padding: col.type === 'signature' ? '8px' : '0' }}
                                />
                                <div style={{
                                  position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  opacity: 0, transition: 'opacity 0.15s'
                                }}
                                  onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                                  onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
                                >
                                  <ZoomIn size={20} color="white" />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
});

function extractStudentIdentityFromDetails(details: string, changes: Array<{ column: string; from: string; to: string }> = []) {
  if (!details && (!changes || changes.length === 0)) return { rb: null, name: null };
  let rb: string | null = null;
  let name: string | null = null;

  const tagMatch = details?.match(/\[(?:RB:\s*([^\|\]]+))?(?:\s*\|\s*)?(?:Student:\s*([^\]]+))?\]/i);
  if (tagMatch) {
    if (tagMatch[1]) rb = tagMatch[1].trim();
    if (tagMatch[2]) name = tagMatch[2].trim();
  }

  if (!rb && details) {
    const rbMatch = details.match(/(?:rb\s*number|rb\s*no|rb|roll\s*no|register\s*no)\s*(?:changed\s+from\s+".*?"\s+to\s+"|is\s+|=|\:)\s*"?(.*?)"?(?:\s*,|\s*$|\]|\:)/i);
    if (rbMatch && rbMatch[1] && rbMatch[1] !== 'empty') {
      rb = rbMatch[1].trim();
    }
  }

  if (!name && details) {
    const nameMatch = details.match(/(?:student\s*name|candidate\s*name|student|name)\s*(?:changed\s+from\s+".*?"\s+to\s+"|is\s+|=|\:)\s*"?(.*?)"?(?:\s*,|\s*$|\]|\:)/i);
    if (nameMatch && nameMatch[1] && nameMatch[1] !== 'empty') {
      name = nameMatch[1].trim();
    }
  }

  if (changes && Array.isArray(changes)) {
    for (const change of changes) {
      const colLower = (change.column || '').toLowerCase().trim();
      const val = (change.to || change.from || '').trim();
      if (!val || val === 'empty') continue;

      if (!rb && (colLower === 'rb number' || colLower === 'rb no' || colLower === 'rb' || colLower === 'roll no' || colLower === 'register no' || colLower === 'reg no')) {
        rb = val;
      }
      if (!name && (colLower === 'student name' || colLower === 'name' || colLower === 'student' || colLower === 'candidate name' || colLower === 'full name')) {
        name = val;
      }
    }
  }

  return { rb, name };
}

function RowHistoryCard({ h, isLatest }: { h: any; isLatest: boolean }) {
  const dt = new Date(h.timestamp);
  const dateStr = dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

  const parsed = React.useMemo(() => {
    if (h.action.toLowerCase() !== 'edit row') {
      return { isEditRow: false, title: h.details, changes: [] };
    }

    const parts = h.details.split(': ');
    if (parts.length < 2) {
      return { isEditRow: true, title: h.details, changes: [] };
    }

    const title = parts[0];
    const changesStr = parts.slice(1).join(': ');

    const changes: Array<{ column: string; from: string; to: string }> = [];
    let currentToken = '';
    let inQuotes = false;

    for (let i = 0; i < changesStr.length; i++) {
      const char = changesStr[i];
      if (char === '"') {
        inQuotes = !inQuotes;
        currentToken += char;
      } else if (char === ',' && !inQuotes) {
        const trimmed = currentToken.trim();
        if (trimmed) {
          changes.push(parseSingleChange(trimmed));
        }
        currentToken = '';
        if (changesStr[i + 1] === ' ') {
          i++;
        }
      } else {
        currentToken += char;
      }
    }

    const finalTrimmed = currentToken.trim();
    if (finalTrimmed) {
      changes.push(parseSingleChange(finalTrimmed));
    }

    return {
      isEditRow: true,
      title,
      changes: changes.filter(c => c.column !== '')
    };
  }, [h.details, h.action]);

  const identity = React.useMemo(() => extractStudentIdentityFromDetails(h.details, parsed.changes), [h.details, parsed.changes]);

  const actionColor =
    h.action === 'Edit Row' ? '#3b82f6' :
    h.action === 'Add Row' || h.action === 'Insert Row' ? '#16a34a' :
    h.action === 'Delete Row' ? '#dc2626' :
    h.action === 'Restore Row' ? '#8b5cf6' : '#64748b';

  return (
    <div className="row-history-card">
      <div className="row-history-card-header">
        <span className="row-audit-action-badge" style={{ background: actionColor }}>{h.action}</span>
        {isLatest && <span className="row-audit-latest-tag">Latest</span>}
        <div className="row-history-card-time">
          <span>{h.userName || 'Unknown User'}</span>
          <span>•</span>
          <span>{dateStr} {timeStr}</span>
        </div>
      </div>

      {/* ── Prominent Student Identity Banner ── */}
      {(identity.name || identity.rb) && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(79, 70, 229, 0.12) 100%)',
          border: '1px solid rgba(99, 102, 241, 0.25)',
          padding: '5px 10px',
          borderRadius: '6px',
          margin: '6px 0 8px 0',
          fontSize: '12px',
          fontWeight: 700,
          color: '#3730a3'
        }}>
          <User size={13} color="#4f46e5" />
          <span>Student: <strong style={{ color: '#1e1b4b' }}>{identity.name || 'N/A'}</strong></span>
          {identity.rb && (
            <span style={{ fontSize: '10.5px', background: '#4f46e5', color: '#ffffff', padding: '2px 6px', borderRadius: '99px', marginLeft: 'auto' }}>
              RB No: {identity.rb}
            </span>
          )}
        </div>
      )}
      
      {parsed.isEditRow && parsed.changes.length > 0 ? (
        <div className="row-history-card-changes">
          <p className="row-history-card-title">{parsed.title}</p>
          <div className="changes-table-wrapper">
            <table className="changes-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Before</th>
                  <th>After</th>
                </tr>
              </thead>
              <tbody>
                {parsed.changes.map((change, idx) => (
                  <tr key={idx}>
                    <td className="col-name">{change.column}</td>
                    <td>
                      {isImageValue(change.from) ? (
                        <div className="history-value-images from">
                          {change.from.split('|||').map((url, i) => (
                            <img 
                              key={i} 
                              src={url.trim()} 
                              alt="Before" 
                              className="history-image-preview" 
                              onClick={() => window.open(url.trim(), '_blank')}
                            />
                          ))}
                        </div>
                      ) : (
                        <span className="change-from">
                          {change.from || <span className="empty-val">empty</span>}
                        </span>
                      )}
                    </td>
                    <td>
                      {isImageValue(change.to) ? (
                        <div className="history-value-images to">
                          {change.to.split('|||').map((url, i) => (
                            <img 
                              key={i} 
                              src={url.trim()} 
                              alt="After" 
                              className="history-image-preview" 
                              onClick={() => window.open(url.trim(), '_blank')}
                            />
                          ))}
                        </div>
                      ) : (
                        <span className="change-to">
                          {change.to || <span className="empty-val">empty</span>}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="row-audit-item-details">{h.details}</p>
      )}
    </div>
  );
}

function isImageValue(val: string): boolean {
  if (!val) return false;
  const urls = val.split('|||');
  return urls.every(url => {
    const u = url.trim();
    return u.startsWith('http://') || u.startsWith('https://') || u.startsWith('data:image/');
  }) && urls.some(url => {
    const u = url.trim().toLowerCase();
    return u.includes('cloudinary.com') || u.includes('/image/upload/') || u.endsWith('.png') || u.endsWith('.jpg') || u.endsWith('.jpeg') || u.endsWith('.gif') || u.endsWith('.webp');
  });
}

function parseSingleChange(part: string): { column: string; from: string; to: string } {
  const match = part.match(/(.+?)\s+changed\s+from\s+"(.*?)"\s+to\s+"(.*?)"$/);
  if (match) {
    return {
      column: match[1].trim(),
      from: match[2],
      to: match[3]
    };
  }
  return { column: '', from: '', to: part };
}

