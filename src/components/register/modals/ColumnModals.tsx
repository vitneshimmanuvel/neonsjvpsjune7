import { AlertCircle, X, Plus, AlertTriangle, Check, ChevronRight, ChevronDown, FolderClosed, FolderOpen, Database, Save, BookMarked, Link as LinkIcon, Paperclip, RefreshCw, Layers } from 'lucide-react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Calculator, PlusCircle, MinusCircle, XCircle, DivideCircle, 
  Percent, Settings2, Trash2 
} from 'lucide-react';
import { evaluateFormula, getRegister, linkColumn, linkMultipleColumns, unlinkColumn, getColumnLinks, listSavedFormulas, createSavedFormula, deleteSavedFormula, listSavedDropdowns, createSavedDropdown, deleteSavedDropdown } from '../../../lib/api';
import type { RegisterSummary, Column as ApiColumn, Folder, SavedFormula, SavedDropdown } from '../../../lib/api';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';

// ── Saved Formula Column Remapping Helpers ──
function normalizeColName(name: string): string {
  return name
    .replace(/[₹$(),\[\]{}]/g, '')
    .replace(/_/g, ' ')
    .trim()
    .split(/\s+/)
    .map(w => w.toLowerCase())
    .filter(Boolean)
    .sort()
    .join(' ');
}

function findBestColumnMatch(
  templateName: string,
  currentColumns: { id: number; name: string }[],
  excludeId?: number | null
): string | null {
  const available = currentColumns.filter(c => excludeId == null || c.id !== excludeId);

  // 1. Exact match
  const exact = available.find(c => c.name === templateName);
  if (exact) return exact.name;

  // 2. Case-insensitive match
  const ciMatch = available.find(c => c.name.toLowerCase() === templateName.toLowerCase());
  if (ciMatch) return ciMatch.name;

  // 3. Normalized word-set match (handles "I PAY (₹)" ↔ "PAY I")
  const normalizedTemplate = normalizeColName(templateName);
  if (normalizedTemplate) {
    const wordSetMatch = available.find(c => normalizeColName(c.name) === normalizedTemplate);
    if (wordSetMatch) return wordSetMatch.name;
  }

  return null;
}

function remapSavedFormula(
  formula: string,
  currentColumns: { id: number; name: string }[],
  excludeId?: number | null
): {
  remappedFormula: string;
  unmatchedNames: string[];
  mapping: Record<string, string>;
  allMatched: boolean;
} {
  const matches = Array.from(formula.matchAll(/\{([^}]+)\}/g));
  const templateNames = [...new Set(matches.map(m => m[1]))];

  const mapping: Record<string, string> = {};
  const unmatchedNames: string[] = [];

  for (const tName of templateNames) {
    const match = findBestColumnMatch(tName, currentColumns, excludeId);
    if (match) {
      mapping[tName] = match;
    } else {
      unmatchedNames.push(tName);
      mapping[tName] = '';
    }
  }

  let remappedFormula = formula;
  for (const [oldName, newName] of Object.entries(mapping)) {
    if (newName && oldName !== newName) {
      const regex = new RegExp(
        '\\{' + oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\}',
        'gi'
      );
      remappedFormula = remappedFormula.replace(regex, `{${newName}}`);
    }
  }

  return { remappedFormula, unmatchedNames, mapping, allMatched: unmatchedNames.length === 0 };
}

function FormulaBuilder({ formula, onChange, columns, entries, outputName, excludeId, businessId }: { formula: string, onChange: (v: string) => void, columns: any[], entries?: any[], outputName?: string, excludeId?: number | null, businessId?: number }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'preset' | 'custom'>('preset');

  // ── Saved Formulas State ──
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showSavedList, setShowSavedList] = useState(false);
  const [remapState, setRemapState] = useState<{
    savedFormula: SavedFormula;
    unmatchedNames: string[];
    dismissedNames: string[];
    mapping: Record<string, string>;
  } | null>(null);
  const queryClient = useQueryClient();

  const { data: savedFormulas = [], isLoading: loadingSaved } = useQuery({
    queryKey: ['saved-formulas', businessId],
    queryFn: () => listSavedFormulas(businessId!),
    enabled: !!businessId,
    staleTime: 30 * 1000,
  });

  const handleSaveFormula = useCallback(async () => {
    if (!businessId || !saveTemplateName.trim() || !formula.trim()) return;
    setIsSaving(true);
    try {
      await createSavedFormula({
        businessId,
        name: saveTemplateName.trim(),
        formula: formula.trim(),
      });
      queryClient.invalidateQueries({ queryKey: ['saved-formulas', businessId] });
      setSaveTemplateName('');
      setShowSaveInput(false);
    } catch (err) {
      console.error('Failed to save formula:', err);
    } finally {
      setIsSaving(false);
    }
  }, [businessId, saveTemplateName, formula, queryClient]);

  const handleDeleteSavedFormula = useCallback(async (id: string) => {
    if (!businessId) return;
    try {
      await deleteSavedFormula(id);
      queryClient.invalidateQueries({ queryKey: ['saved-formulas', businessId] });
    } catch (err) {
      console.error('Failed to delete saved formula:', err);
    }
  }, [businessId, queryClient]);

  const insertText = (text: string) => {
    const input = inputRef.current;
    if (input) {
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      const val = formula;
      const newVal = val.substring(0, start) + text + val.substring(end);
      onChange(newVal);
      
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const newPos = start + text.length;
          inputRef.current.setSelectionRange(newPos, newPos);
        }
      }, 10);
    } else {
      onChange(formula + text);
    }
  };
  const [presetType, setPresetType] = useState<'add' | 'sub' | 'mul' | 'div' | 'pct'>('add');
  
  // Selection state for presets
  const [selectedCols, setSelectedCols] = useState<number[]>([]); // For Add, Mul, Sub
  const [colA, setColA] = useState<number | null>(null); // For Div, Pct (numerator)
  const [colB, setColB] = useState<number | null>(null); // For Div, Pct (denominator)
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Sync selection state from existing formula
  useEffect(() => {
    if (!formula) return;
    
    // Detect preset type locally to avoid dependency on async state
    let detectedType: 'add' | 'sub' | 'mul' | 'div' | 'pct' | null = null;
    if (formula.includes('+')) {
      detectedType = 'add';
    } else if (formula.includes('-') && formula.includes('{')) {
      // Subtraction preset: {A} - {B} - {C}
      detectedType = 'sub';
    } else if (formula.includes('*') && !formula.includes('/')) {
      detectedType = 'mul';
    } else if (formula.includes('/') && !formula.includes('*100')) {
      detectedType = 'div';
    } else if (formula.includes('/') && formula.includes('*100')) {
      detectedType = 'pct';
    }

    if (detectedType) {
      setPresetType(detectedType);
    } else if (formula) {
      setMode('custom');
    }

    // Extract column names from formula like {Name}
    const matches = Array.from(formula.matchAll(/\{([^}]+)\}/g));
    const foundNames = matches.map(m => m[1]);
    const foundIds = foundNames.map(name => columns.find(c => c.name === name)?.id).filter(Boolean) as number[];

    if (foundIds.length > 0) {
      if (detectedType === 'div' || detectedType === 'pct') {
        setColA(foundIds[0]);
        setColB(foundIds[1] || null);
      } else {
        setSelectedCols(foundIds);
      }
    }
  }, []); // Only run once on mount to initialize UI from existing formula

  const generateFormula = (type: string, sCols: number[], a: number | null, b: number | null) => {
    const colName = (id: number) => {
      const c = columns.find(col => col.id === id);
      return c ? `{${c.name}}` : '';
    };

    let f = '';
    switch (type) {
      case 'add':
        f = sCols.map(id => colName(id)).filter(Boolean).join(' + ');
        break;
      case 'sub':
        f = sCols.map(id => colName(id)).filter(Boolean).join(' - ');
        break;
      case 'mul':
        f = sCols.map(id => colName(id)).filter(Boolean).join(' * ');
        break;
      case 'div':
        if (a && b) f = `${colName(a)} / ${colName(b)}`;
        break;
      case 'pct':
        if (a && b) f = `(${colName(a)} / ${colName(b)}) * 100`;
        break;
    }
    if (f !== formula) {
      onChange(f);
    }
  };

  const handlePresetChange = (type: any) => {
    setPresetType(type);
    generateFormula(type, selectedCols, colA, colB);
  };

  const toggleColSelection = (id: number) => {
    const isSelected = selectedCols.includes(id);
    const next = isSelected 
      ? selectedCols.filter(i => i !== id) 
      : [...selectedCols, id];
    setSelectedCols(next);
    generateFormula(presetType, next, colA, colB);
  };

  const removeColAtIndex = (index: number) => {
    const next = selectedCols.filter((_, i) => i !== index);
    setSelectedCols(next);
    generateFormula(presetType, next, colA, colB);
  };

  const setA = (id: number | null) => {
    setColA(id);
    generateFormula(presetType, selectedCols, id, colB);
  };

  const setB = (id: number | null) => {
    setColB(id);
    generateFormula(presetType, selectedCols, colA, id);
  };

  const [previewResult, setPreviewResult] = useState<string>('0');
  const debounceTimer = useRef<any>(null);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (!formula || !entries || entries.length === 0) {
      setPreviewResult('0');
      return;
    }

    debounceTimer.current = setTimeout(() => {
      const result = evaluateFormula(formula, entries[0], columns);
      setPreviewResult(result || '0');
    }, 200);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [formula, entries, columns]);

  const duplicateColsInFormula = columns.filter(c => c.id !== excludeId && formula.split(`{${c.name}}`).length > 2);

  return (
    <div className="formula-builder" style={{ marginTop: '12px', padding: '12px', background: 'var(--bg-light)', borderRadius: '8px', border: '1px solid var(--border)' }}>
      {/* ── Saved Formulas Section ── */}
      {businessId && (
        <div style={{ marginBottom: '14px' }}>
          <button
            type="button"
            onClick={() => setShowSavedList(!showSavedList)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
              padding: '10px 14px', fontSize: '13px', fontWeight: 700,
              borderRadius: '10px', border: '1px solid var(--border)',
              background: showSavedList ? 'var(--navy)' : 'white',
              color: showSavedList ? 'white' : 'var(--navy)',
              cursor: 'pointer', transition: 'all 0.2s',
              boxShadow: showSavedList ? '0 2px 8px rgba(26,35,126,0.15)' : '0 1px 3px rgba(0,0,0,0.04)'
            }}
          >
            <BookMarked size={16} />
            Saved Formulas
            {savedFormulas.length > 0 && (
              <span style={{
                marginLeft: 'auto', fontSize: '11px', fontWeight: 800,
                background: showSavedList ? 'rgba(255,255,255,0.2)' : 'var(--bg-light)',
                padding: '2px 8px', borderRadius: '12px',
                color: showSavedList ? 'white' : 'var(--muted)'
              }}>
                {savedFormulas.length}
              </span>
            )}
            <ChevronDown size={14} style={{ marginLeft: savedFormulas.length > 0 ? '0' : 'auto', transition: 'transform 0.2s', transform: showSavedList ? 'rotate(180deg)' : 'rotate(0deg)' }} />
          </button>

          {showSavedList && (
            <div style={{
              marginTop: '8px', maxHeight: '220px', overflowY: 'auto',
              border: '1px solid var(--border)', borderRadius: '10px',
              background: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
            }}>
              {loadingSaved ? (
                <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }}></span>
                  Loading saved formulas...
                </div>
              ) : savedFormulas.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--muted)' }}>
                  <BookMarked size={20} style={{ opacity: 0.3, marginBottom: '6px' }} />
                  <div>No saved formulas yet.</div>
                  <div style={{ fontSize: '11px', marginTop: '2px' }}>Save a formula below to reuse it across registers.</div>
                </div>
              ) : (
                savedFormulas.map((sf) => (
                  <div
                    key={sf.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '10px 14px', borderBottom: '1px solid var(--bg-light)',
                      cursor: 'pointer', transition: 'background 0.15s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-light)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                    onClick={() => {
                      const result = remapSavedFormula(sf.formula, columns, excludeId);
                      if (result.allMatched) {
                        onChange(result.remappedFormula);
                        setShowSavedList(false);
                        setMode('custom');
                      } else {
                        setRemapState({
                          savedFormula: sf,
                          unmatchedNames: result.unmatchedNames,
                          dismissedNames: [],
                          mapping: result.mapping,
                        });
                        setShowSavedList(false);
                      }
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--navy)', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {sf.name}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }}>
                        {sf.formula}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete saved formula "${sf.name}"?`)) {
                          handleDeleteSavedFormula(sf.id);
                        }
                      }}
                      style={{
                        padding: '4px', color: 'var(--muted)', background: 'none',
                        border: 'none', cursor: 'pointer', opacity: 0.5,
                        transition: 'opacity 0.2s, color 0.2s', flexShrink: 0
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--danger)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--muted)'; }}
                      title="Delete saved formula"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Column Remapping UI ── */}
          {remapState && (
            <div style={{
              marginTop: '8px', padding: '14px',
              border: '2px solid #f59e0b', borderRadius: '10px',
              background: '#fffbeb',
              boxShadow: '0 4px 12px rgba(245,158,11,0.12)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <AlertTriangle size={16} color="#f59e0b" />
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--navy)' }}>
                  Column Mapping Required
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px', lineHeight: 1.4 }}>
                Some columns in "<strong>{remapState.savedFormula.name}</strong>" don't match this register. Map or dismiss (✕) them:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                {remapState.unmatchedNames.filter(n => !remapState.dismissedNames.includes(n)).map(name => (
                  <div key={name} style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 10px', background: 'white', borderRadius: '8px',
                    border: '1px solid var(--border)'
                  }}>
                    <span style={{
                      fontSize: '12px', fontWeight: 600, color: '#dc2626',
                      fontFamily: 'monospace', minWidth: '100px', flexShrink: 0,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}>
                      {`{${name}}`}
                    </span>
                    <span style={{ fontSize: '14px', color: 'var(--muted)', flexShrink: 0 }}>→</span>
                    <select
                      style={{
                        flex: 1, padding: '6px 8px', fontSize: '12px',
                        borderRadius: '6px', border: '1px solid var(--border)',
                        background: 'white', color: 'var(--text-main)',
                        cursor: 'pointer', minWidth: 0
                      }}
                      value={remapState.mapping[name] || ''}
                      onChange={(e) => {
                        setRemapState(prev => {
                          if (!prev) return null;
                          return {
                            ...prev,
                            mapping: { ...prev.mapping, [name]: e.target.value }
                          };
                        });
                      }}
                    >
                      <option value="">— Select column —</option>
                      {columns.filter(c => c.id !== excludeId).map(c => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      title={`Remove {${name}} from formula`}
                      onClick={() => {
                        setRemapState(prev => {
                          if (!prev) return null;
                          return {
                            ...prev,
                            dismissedNames: [...prev.dismissedNames, name]
                          };
                        });
                      }}
                      style={{
                        padding: '4px', background: 'none', border: 'none',
                        cursor: 'pointer', color: 'var(--muted)', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: '4px', transition: 'all 0.15s'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.background = '#fef2f2'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'none'; }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
                {remapState.dismissedNames.length > 0 && (
                  <div style={{ fontSize: '11px', color: 'var(--muted)', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', padding: '4px 0' }}>
                    <span>Removed:</span>
                    {remapState.dismissedNames.map(name => (
                      <span
                        key={name}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          fontSize: '11px', color: 'var(--muted)', background: 'var(--bg-light)',
                          padding: '2px 8px', borderRadius: '12px', textDecoration: 'line-through',
                          fontFamily: 'monospace', cursor: 'pointer', transition: 'all 0.15s'
                        }}
                        title="Click to restore"
                        onClick={() => {
                          setRemapState(prev => {
                            if (!prev) return null;
                            return {
                              ...prev,
                              dismissedNames: prev.dismissedNames.filter(n => n !== name)
                            };
                          });
                        }}
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                {(() => {
                  const activeUnmatched = remapState.unmatchedNames.filter(n => !remapState.dismissedNames.includes(n));
                  const canApply = activeUnmatched.every(n => remapState.mapping[n]);
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        let finalFormula = remapState.savedFormula.formula;
                        // Apply column mappings
                        for (const [oldName, newName] of Object.entries(remapState.mapping)) {
                          if (newName) {
                            const regex = new RegExp(
                              '\\{' + oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\}',
                              'gi'
                            );
                            finalFormula = finalFormula.replace(regex, `{${newName}}`);
                          }
                        }
                        // Strip dismissed columns and clean up adjacent operators
                        for (const dismissed of remapState.dismissedNames) {
                          const escaped = dismissed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                          // Remove with preceding operator: " - {name}", " + {name}", etc.
                          finalFormula = finalFormula.replace(new RegExp('\\s*[+\\-*/]\\s*\\{' + escaped + '\\}', 'gi'), '');
                          // Remove with following operator (if first term): "{name} - ", "{name} + "
                          finalFormula = finalFormula.replace(new RegExp('\\{' + escaped + '\\}\\s*[+\\-*/]\\s*', 'gi'), '');
                          // If still present (only term), just remove it
                          finalFormula = finalFormula.replace(new RegExp('\\{' + escaped + '\\}', 'gi'), '');
                        }
                        finalFormula = finalFormula.trim();
                        onChange(finalFormula);
                        setRemapState(null);
                        setMode('custom');
                      }}
                      disabled={!canApply}
                      style={{
                        flex: 1, padding: '8px', fontSize: '12px', fontWeight: 700,
                        borderRadius: '8px', border: 'none',
                        background: canApply ? 'var(--navy)' : 'var(--bg-light)',
                        color: canApply ? 'white' : 'var(--muted)',
                        cursor: canApply ? 'pointer' : 'not-allowed',
                        transition: 'all 0.2s',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                      }}
                    >
                      <Check size={14} />
                      Apply Mapped Formula
                    </button>
                  );
                })()}
                <button
                  type="button"
                  onClick={() => setRemapState(null)}
                  style={{
                    padding: '8px 16px', fontSize: '12px', fontWeight: 600,
                    borderRadius: '8px', border: '1px solid var(--border)',
                    background: 'white', color: 'var(--muted)',
                    cursor: 'pointer', transition: 'all 0.2s'
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="formula-mode-tabs" style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <button 
          className={`mode-tab ${mode === 'preset' ? 'active' : ''}`} 
          onClick={() => setMode('preset')}
          style={{ flex: 1, padding: '6px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: mode === 'preset' ? 'var(--navy)' : 'white', color: mode === 'preset' ? 'white' : 'var(--text-main)', cursor: 'pointer', fontWeight: mode === 'preset' ? 600 : 400 }}
        >
          Visual Builder (Preset)
        </button>
        <button 
          className={`mode-tab ${mode === 'custom' ? 'active' : ''}`} 
          onClick={() => setMode('custom')}
          style={{ flex: 1, padding: '8px', fontSize: '13px', borderRadius: '8px', border: '1px solid var(--border)', background: mode === 'custom' ? 'var(--navy)' : 'white', color: mode === 'custom' ? 'white' : 'var(--text-main)', cursor: 'pointer', fontWeight: mode === 'custom' ? 700 : 500, transition: 'all 0.2s' }}
        >
          Custom Formula (Advanced)
        </button>
      </div>

      {mode === 'preset' ? (
        <div className="preset-editor">
          <div className="preset-types" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '12px' }}>
            <button onClick={() => handlePresetChange('add')} className={`preset-btn ${presetType === 'add' ? 'active' : ''}`} style={presetBtnStyle(presetType === 'add')}>
              <PlusCircle size={14} /> Add
            </button>
            <button onClick={() => handlePresetChange('sub')} className={`preset-btn ${presetType === 'sub' ? 'active' : ''}`} style={presetBtnStyle(presetType === 'sub')}>
              <MinusCircle size={14} /> Sub
            </button>
            <button onClick={() => handlePresetChange('mul')} className={`preset-btn ${presetType === 'mul' ? 'active' : ''}`} style={presetBtnStyle(presetType === 'mul')}>
              <XCircle size={14} /> Mult
            </button>
            <button onClick={() => handlePresetChange('div')} className={`preset-btn ${presetType === 'div' ? 'active' : ''}`} style={presetBtnStyle(presetType === 'div')}>
              <DivideCircle size={14} /> Div
            </button>
            <button onClick={() => handlePresetChange('pct')} className={`preset-btn ${presetType === 'pct' ? 'active' : ''}`} style={presetBtnStyle(presetType === 'pct')}>
              <Percent size={14} /> %
            </button>
            <button onClick={() => setMode('custom')} className="preset-btn" style={presetBtnStyle(false)}>
              <Settings2 size={14} /> More
            </button>
          </div>

          {(presetType === 'add' || presetType === 'mul' || presetType === 'sub') && (
            <div className="col-selector" style={{ marginTop: '16px' }}>
              <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase' }}>
                Build your calculation step-by-step:
              </label>
              
              {/* Added Columns List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                {selectedCols.length === 0 && (
                  <div style={{ padding: '12px', border: '1px dashed var(--border)', borderRadius: '8px', textAlign: 'center', fontSize: '12px', color: 'var(--muted)' }}>
                    No columns added yet. Use the search below to start.
                  </div>
                )}
                {selectedCols.map((id, index) => {
                  const col = columns.find(c => c.id === id);
                  if (!col) return null;
                  return (
                    <div key={`${id}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'white', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--navy)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800 }}>
                        {index + 1}
                      </div>
                      <span style={{ flex: 1, fontSize: '13px', fontWeight: 500 }}>{col.name}</span>
                      {index > 0 && (
                        <div style={{ fontSize: '12px', fontWeight: 900, color: 'var(--primary)', padding: '0 8px' }}>
                          {presetType === 'add' ? '+' : presetType === 'mul' ? '×' : '-'}
                        </div>
                      )}
                      <button 
                        onClick={() => removeColAtIndex(index)}
                        style={{ padding: '4px', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Search and Add Section */}
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <input 
                      type="text" 
                      className="modal-input"
                      style={{ marginBottom: 0, paddingLeft: '32px', fontSize: '13px' }}
                      placeholder="Search columns to add..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setIsDropdownOpen(true);
                      }}
                      onFocus={() => setIsDropdownOpen(true)}
                    />
                    <Settings2 size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                    {searchQuery && (
                      <button 
                        onClick={() => setSearchQuery('')}
                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {isDropdownOpen && (
                  <div style={{ 
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, 
                    marginTop: '4px', background: 'white', border: '1px solid var(--border)', 
                    borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: '200px', overflowY: 'auto' 
                  }}>
                    {columns
                      .filter(c => c.id !== excludeId && c.name.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map(c => (
                        <button
                          key={c.id}
                          onClick={() => {
                            toggleColSelection(c.id);
                            setSearchQuery('');
                            setIsDropdownOpen(false);
                          }}
                          style={{ 
                            width: '100%', padding: '10px 12px', textAlign: 'left', background: 'none', border: 'none', 
                            borderBottom: '1px solid var(--bg-light)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                            transition: 'background 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-light)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                        >
                          <PlusCircle size={14} color="var(--primary)" />
                          <span style={{ fontSize: '13px', color: 'var(--text-main)' }}>{c.name}</span>
                          <span style={{ fontSize: '10px', color: 'var(--muted)', background: 'var(--bg-light)', padding: '2px 4px', borderRadius: '4px' }}>{c.type}</span>
                        </button>
                      ))}
                    {columns.filter(c => c.id !== excludeId && c.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                      <div style={{ padding: '12px', fontSize: '12px', color: 'var(--muted)', textAlign: 'center' }}>No columns found</div>
                    )}
                  </div>
                )}
              </div>

              <button 
                className="modal-confirm-btn"
                style={{ width: '100%', marginTop: '12px', background: 'var(--primary-light)', color: 'var(--primary)', border: '1px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '12px' }}
                onClick={() => setIsDropdownOpen(true)}
              >
                <Plus size={16} /> Add {selectedCols.length > 0 ? 'Another' : 'a'} Column
              </button>
            </div>
          )}

          {(presetType === 'div' || presetType === 'pct') && (
            <div className="dual-col-selector" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                  {presetType === 'div' ? 'Dividend (Top)' : 'Value (Obtained)'}
                </label>
                <select 
                  className="modal-input" 
                  style={{ marginBottom: 0, padding: '4px', fontSize: '12px' }}
                  value={colA || ''} 
                  onChange={(e) => setA(Number(e.target.value))}
                >
                  <option value="">Select Column</option>
                  {columns.filter(c => c.id !== excludeId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                  {presetType === 'div' ? 'Divisor (Bottom)' : 'Total (Out of)'}
                </label>
                <select 
                  className="modal-input" 
                  style={{ marginBottom: 0, padding: '4px', fontSize: '12px' }}
                  value={colB || ''} 
                  onChange={(e) => setB(Number(e.target.value))}
                >
                  <option value="">Select Column</option>
                  {columns.filter(c => c.id !== excludeId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="custom-editor">
          <label className="modal-label" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Formula Expression</label>
          <textarea 
            ref={inputRef as any}
            className="modal-textarea" 
            value={formula} 
            onChange={(e) => onChange(e.target.value)} 
            placeholder="e.g. {Marks} / {Full Marks} * 100"
            style={{ minHeight: '100px', fontSize: '15px', fontWeight: 600, fontFamily: 'monospace', borderColor: duplicateColsInFormula.length > 0 ? '#ef4444' : undefined }}
          />
          
          {duplicateColsInFormula.length > 0 && (
            <div style={{ marginTop: '4px', fontSize: '12px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
              <AlertTriangle size={14} /> 
              Warning: Columns cannot be used multiple times ({duplicateColsInFormula.map(c => `{${c.name}}`).join(', ')})
            </div>
          )}
          
          <div style={{ marginTop: '8px', marginBottom: '12px' }}>
            <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Operators:</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {[
                { label: '+', value: '+' },
                { label: '-', value: '-' },
                { label: '*', value: '*' },
                { label: '/', value: '/' },
                { label: '(', value: '(' },
                { label: ')', value: ')' },
                { label: '.', value: '.' },
                { label: '^', value: '^' },
              ].map(op => (
                <button 
                  key={op.value} 
                  onClick={() => insertText(op.value)}
                  style={{ 
                    padding: '6px 12px', 
                    fontSize: '14px', 
                    fontWeight: 800,
                    borderRadius: '6px', 
                    border: '1px solid var(--border)', 
                    background: 'white', 
                    cursor: 'pointer',
                    minWidth: '38px',
                    color: 'var(--navy)',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s'
                  }}
                  type="button"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-light)';
                    e.currentTarget.style.borderColor = 'var(--primary-light)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'white';
                    e.currentTarget.style.borderColor = 'var(--border)';
                  }}
                >
                  {op.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: '12px' }}>
            <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '8px', fontWeight: 700, textTransform: 'uppercase' }}>Select Columns to Insert:</label>
            <div style={{ 
              display: 'flex', 
              flexWrap: 'wrap', 
              gap: '6px', 
              padding: '12px', 
              background: 'white', 
              border: '1px solid var(--border)', 
              borderRadius: '10px',
              minHeight: '160px',
              maxHeight: '250px',
              overflowY: 'auto',
              alignContent: 'flex-start',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
            }}>
              {columns.filter(c => c.id !== excludeId).map(c => {
                const isUsed = formula.includes(`{${c.name}}`);
                return (
                  <button 
                    key={c.id} 
                    onClick={() => {
                      if (!isUsed) insertText(`{${c.name}}`);
                    }}
                    style={{ 
                      padding: '6px 12px', 
                      fontSize: '12px', 
                      fontWeight: 600,
                      borderRadius: '8px', 
                      border: isUsed ? '1px solid #fca5a5' : '1px solid var(--border)', 
                      background: isUsed ? '#fef2f2' : 'var(--bg-light)', 
                      cursor: isUsed ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      color: isUsed ? '#dc2626' : 'var(--navy)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      opacity: isUsed ? 0.8 : 1
                    }}
                    type="button"
                    onMouseEnter={(e) => {
                      if (!isUsed) {
                        e.currentTarget.style.background = 'white';
                        e.currentTarget.style.borderColor = 'var(--navy)';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isUsed) {
                        e.currentTarget.style.background = 'var(--bg-light)';
                        e.currentTarget.style.borderColor = 'var(--border)';
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = 'none';
                      }
                    }}
                    title={isUsed ? 'Column already added' : `Insert ${c.name}`}
                  >
                    {c.name}
                  </button>
                );
              })}
              {columns.filter(c => c.id !== excludeId).length === 0 && (
                <div style={{ width: '100%', textAlign: 'center', color: 'var(--muted)', fontSize: '12px', padding: '20px' }}>
                  No other columns available to reference.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="formula-preview" style={{ marginTop: '16px', borderTop: '2px solid var(--border)', paddingTop: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <label style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase' }}>
            Live Calculation Preview
          </label>
          <div style={{ fontSize: '10px', color: 'var(--primary)', fontWeight: 600 }}>
            {outputName || 'New Column'} = {formula || '—'}
          </div>
        </div>
        
        <div style={{ background: 'white', padding: '14px', borderRadius: '12px', border: '1px solid var(--primary-light)', boxShadow: '0 4px 12px rgba(26,35,126,0.08)' }}>
          {entries && entries.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 600 }}>Testing with Row 1:</span>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {columns.filter(c => formula.includes(`{${c.name}}`)).slice(0, 3).map(c => (
                    <span key={c.id} style={{ fontSize: '11px', background: 'var(--bg-light)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                      {c.name}: <b>{entries[0].cells?.[c.id.toString()] || '0'}</b>
                    </span>
                  ))}
                  {columns.filter(c => formula.includes(`{${c.name}}`)).length > 3 && <span style={{ fontSize: '11px', color: 'var(--muted)' }}>...</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right', borderLeft: '1px solid var(--border)', paddingLeft: '16px' }}>
                <span style={{ fontSize: '10px', color: 'var(--muted)', display: 'block', fontWeight: 600 }}>Result:</span>
                <span style={{ fontSize: '22px', fontWeight: 900, color: 'var(--navy)', lineHeight: 1 }}>
                  {previewResult}
                </span>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '10px', fontSize: '13px', color: 'var(--muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <Calculator size={20} opacity={0.3} />
              <span>Add data to Row 1 to see calculation results.</span>
            </div>
          )}
        </div>
        <div style={{ marginTop: '10px', display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '11px', color: 'var(--muted)', lineHeight: 1.4 }}>
          <AlertCircle size={14} style={{ marginTop: '1px', flexShrink: 0 }} />
          <span>The formula calculates automatically as you type in any row. No manual refresh needed.</span>
        </div>
      </div>

      {/* ── Save as Template Button ── */}
      {businessId && formula.trim() && (
        <div style={{ marginTop: '14px', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
          {showSaveInput ? (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                className="modal-input"
                style={{ marginBottom: 0, flex: 1, fontSize: '13px', height: '38px' }}
                placeholder="Formula template name..."
                value={saveTemplateName}
                onChange={(e) => setSaveTemplateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && saveTemplateName.trim()) handleSaveFormula();
                  if (e.key === 'Escape') { setShowSaveInput(false); setSaveTemplateName(''); }
                }}
                autoFocus
              />
              <button
                type="button"
                onClick={handleSaveFormula}
                disabled={!saveTemplateName.trim() || isSaving}
                style={{
                  padding: '8px 16px', fontSize: '12px', fontWeight: 700,
                  borderRadius: '8px', border: 'none',
                  background: saveTemplateName.trim() ? 'var(--navy)' : 'var(--bg-light)',
                  color: saveTemplateName.trim() ? 'white' : 'var(--muted)',
                  cursor: saveTemplateName.trim() ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s', whiteSpace: 'nowrap'
                }}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => { setShowSaveInput(false); setSaveTemplateName(''); }}
                style={{ padding: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowSaveInput(true)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                width: '100%', padding: '10px', fontSize: '12px', fontWeight: 700,
                borderRadius: '8px', border: '1px dashed var(--border)',
                background: 'white', color: 'var(--navy)', cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--navy)'; e.currentTarget.style.background = 'var(--bg-light)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'white'; }}
            >
              <Save size={14} />
              Save as Template
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const presetBtnStyle = (active: boolean) => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
  padding: '6px', fontSize: '11px', borderRadius: '6px', border: `1px solid ${active ? 'var(--navy)' : 'var(--border)'}`,
  background: active ? 'var(--navy)' : 'white', color: active ? 'white' : 'var(--text-main)',
  cursor: 'pointer', transition: 'all 0.2s'
});

const PRESET_OPTION_COLORS = [
  { name: 'Emerald', hex: '#10b981' },
  { name: 'Rose', hex: '#ef4444' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Purple', hex: '#8b5cf6' },
  { name: 'Indigo', hex: '#6366f1' },
  { name: 'Teal', hex: '#14b8a6' },
  { name: 'Slate', hex: '#64748b' },
];

function getDefaultOptionColor(val: string): string {
  const valLower = (val || '').trim().toLowerCase();
  if (valLower === 'yes') return '#10b981';
  if (valLower === 'no') return '#ef4444';
  if (valLower === 'pending') return '#f59e0b';
  if (valLower === 'in progress') return '#3b82f6';
  if (valLower === 'completed' || valLower === 'done') return '#10b981';
  if (valLower === 'cancelled' || valLower === 'failed') return '#ef4444';
  return '#64748b';
}

function OptionsEditor({ 
  value, 
  onChange, 
  optionColors = {},
  onOptionColorsChange,
  columnData = [], 
  businessId 
}: { 
  value: string, 
  onChange: (v: string) => void, 
  optionColors?: Record<string, string>,
  onOptionColorsChange?: (colors: Record<string, string>) => void,
  columnData?: string[], 
  businessId?: number 
}) {
  const [opts, setOpts] = useState<string[]>(() => value ? value.split(',') : []);
  const [openColorIndex, setOpenColorIndex] = useState<number | null>(null);
  const lastSentValue = useRef(value);

  // ── Saved Dropdowns State ──
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showSavedList, setShowSavedList] = useState(false);
  const queryClient = useQueryClient();

  const { data: savedDropdowns = [], isLoading: loadingSaved } = useQuery({
    queryKey: ['saved-dropdowns', businessId],
    queryFn: () => listSavedDropdowns(businessId!),
    enabled: !!businessId,
    staleTime: 30 * 1000,
  });

  const handleSaveDropdown = useCallback(async () => {
    if (!businessId || !saveTemplateName.trim() || opts.length === 0) return;
    setIsSaving(true);
    try {
      await createSavedDropdown({
        businessId,
        name: saveTemplateName.trim(),
        options: opts.join(','),
      });
      queryClient.invalidateQueries({ queryKey: ['saved-dropdowns', businessId] });
      setSaveTemplateName('');
      setShowSaveInput(false);
    } catch (err) {
      console.error('Failed to save dropdown:', err);
    } finally {
      setIsSaving(false);
    }
  }, [businessId, saveTemplateName, opts, queryClient]);

  const handleDeleteSavedDropdown = useCallback(async (id: string) => {
    if (!businessId) return;
    try {
      await deleteSavedDropdown(id);
      queryClient.invalidateQueries({ queryKey: ['saved-dropdowns', businessId] });
    } catch (err) {
      console.error('Failed to delete saved dropdown:', err);
    }
  }, [businessId, queryClient]);
  
  useEffect(() => {
    if (value !== lastSentValue.current) {
      setOpts(value ? value.split(',') : []);
      lastSentValue.current = value;
    }
  }, [value]);

  const updateOpts = (newOpts: string[]) => {
    setOpts(newOpts);
    const newStr = newOpts.join(',');
    lastSentValue.current = newStr;
    onChange(newStr);
  };

  return (
    <div className="options-editor-container">
      {/* ── Saved Dropdown Templates ── */}
      {businessId && (
        <div style={{ marginBottom: '14px' }}>
          <button
            type="button"
            onClick={() => setShowSavedList(!showSavedList)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
              padding: '10px 14px', fontSize: '13px', fontWeight: 700,
              borderRadius: '10px', border: '1px solid var(--border)',
              background: showSavedList ? 'var(--navy)' : 'white',
              color: showSavedList ? 'white' : 'var(--navy)',
              cursor: 'pointer', transition: 'all 0.2s',
              boxShadow: showSavedList ? '0 2px 8px rgba(26,35,126,0.15)' : '0 1px 3px rgba(0,0,0,0.04)'
            }}
          >
            <BookMarked size={16} />
            Saved Dropdown Templates
            {savedDropdowns.length > 0 && (
              <span style={{
                marginLeft: 'auto', fontSize: '11px', fontWeight: 800,
                background: showSavedList ? 'rgba(255,255,255,0.2)' : 'var(--bg-light)',
                padding: '2px 8px', borderRadius: '12px',
                color: showSavedList ? 'white' : 'var(--muted)'
              }}>
                {savedDropdowns.length}
              </span>
            )}
            <ChevronDown size={14} style={{ marginLeft: savedDropdowns.length > 0 ? '0' : 'auto', transition: 'transform 0.2s', transform: showSavedList ? 'rotate(180deg)' : 'rotate(0deg)' }} />
          </button>

          {showSavedList && (
            <div style={{
              marginTop: '8px', maxHeight: '220px', overflowY: 'auto',
              border: '1px solid var(--border)', borderRadius: '10px',
              background: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
            }}>
              {loadingSaved ? (
                <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }}></span>
                  Loading saved templates...
                </div>
              ) : savedDropdowns.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--muted)' }}>
                  <BookMarked size={20} style={{ opacity: 0.3, marginBottom: '6px' }} />
                  <div>No saved dropdown templates yet.</div>
                  <div style={{ fontSize: '11px', marginTop: '2px' }}>Save your options below to reuse them across columns.</div>
                </div>
              ) : (
                savedDropdowns.map((sd) => {
                  const optList = sd.options ? sd.options.split(',') : [];
                  return (
                    <div
                      key={sd.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '10px 14px', borderBottom: '1px solid var(--bg-light)',
                        cursor: 'pointer', transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-light)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                      onClick={() => {
                        updateOpts(optList);
                        setShowSavedList(false);
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--navy)', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {sd.name}
                        </div>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {optList.slice(0, 4).map((o, i) => (
                            <span key={i} style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '10px', background: 'var(--bg-light)', border: '1px solid var(--border)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{o}</span>
                          ))}
                          {optList.length > 4 && <span style={{ fontSize: '10px', color: 'var(--muted)' }}>+{optList.length - 4} more</span>}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete saved dropdown "${sd.name}"?`)) {
                            handleDeleteSavedDropdown(sd.id);
                          }
                        }}
                        style={{
                          padding: '4px', color: 'var(--muted)', background: 'none',
                          border: 'none', cursor: 'pointer', opacity: 0.5,
                          transition: 'opacity 0.2s, color 0.2s', flexShrink: 0
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--danger)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--muted)'; }}
                        title="Delete saved dropdown"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <label className="modal-label" style={{ margin: 0, fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
          Predefined Options ({opts.length})
        </label>
        <button 
          type="button" 
          onClick={() => { if (confirm('Clear all options?')) updateOpts([]); }}
          style={{ fontSize: '11px', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
        >
          Clear All
        </button>
      </div>

      <div className="options-list-scroll" style={{ maxHeight: '220px', overflowY: 'auto', marginBottom: '12px', paddingRight: '4px' }}>
        {opts.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: '8px', color: 'var(--muted)', fontSize: '12px', background: 'var(--bg-light)' }}>
            No predefined options yet. Add some below or pick from existing data.
          </div>
        ) : (
          opts.map((opt, i) => {
            const curColor = optionColors[opt] || getDefaultOptionColor(opt);
            return (
              <div key={i} className="options-editor-row" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '50%', background: 'var(--bg-light)', color: 'var(--muted)', fontSize: '10px', fontWeight: 700 }}>
                  {i + 1}
                </div>
                <input 
                  className="modal-input" 
                  style={{ marginBottom: 0, flex: 1, height: '36px', fontSize: '13px' }} 
                  value={opt} 
                  onChange={(e) => {
                    const newOpts = [...opts];
                    const oldOpt = newOpts[i];
                    newOpts[i] = e.target.value;
                    if (onOptionColorsChange && optionColors[oldOpt]) {
                      const newColors = { ...optionColors };
                      newColors[e.target.value] = newColors[oldOpt];
                      delete newColors[oldOpt];
                      onOptionColorsChange(newColors);
                    }
                    updateOpts(newOpts);
                  }} 
                  placeholder="Option name" 
                />

                {/* Color swatch picker */}
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => setOpenColorIndex(openColorIndex === i ? null : i)}
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      border: '2px solid white',
                      boxShadow: '0 0 0 1px var(--border), 0 1px 3px rgba(0,0,0,0.1)',
                      backgroundColor: curColor,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                    title={`Color for "${opt}"`}
                  />

                  {openColorIndex === i && (
                    <div style={{
                      position: 'absolute', right: 0, top: '100%', marginTop: '6px',
                      zIndex: 100, background: 'white', border: '1px solid var(--border)',
                      borderRadius: '10px', padding: '10px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                      width: '180px'
                    }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--navy)', marginBottom: '8px' }}>Assign Color</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '8px' }}>
                        {PRESET_OPTION_COLORS.map(p => (
                          <button
                            key={p.hex}
                            type="button"
                            onClick={() => {
                              if (onOptionColorsChange) {
                                onOptionColorsChange({ ...optionColors, [opt]: p.hex });
                              }
                              setOpenColorIndex(null);
                            }}
                            style={{
                              width: '28px', height: '28px', borderRadius: '50%', background: p.hex,
                              border: curColor === p.hex ? '2px solid #0f172a' : '1px solid rgba(0,0,0,0.1)',
                              cursor: 'pointer'
                            }}
                            title={p.name}
                          />
                        ))}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingTop: '6px', borderTop: '1px solid var(--bg-light)' }}>
                        <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>Custom:</span>
                        <input
                          type="color"
                          value={curColor}
                          onChange={(e) => {
                            if (onOptionColorsChange) {
                              onOptionColorsChange({ ...optionColors, [opt]: e.target.value });
                            }
                          }}
                          style={{ width: '32px', height: '24px', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <button 
                  type="button" 
                  onClick={() => {
                    const newOpts = [...opts];
                    newOpts.splice(i, 1);
                    updateOpts(newOpts);
                  }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '6px', opacity: 0.6, transition: 'opacity 0.2s' }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
                >
                  <X size={16} />
                </button>
              </div>
            );
          })
        )}
      </div>

      <button 
        type="button" 
        onClick={() => {
          const newOptName = `Option ${opts.length + 1}`;
          updateOpts([...opts, newOptName]);
        }}
        style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-light)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', cursor: 'pointer', color: 'var(--navy)', width: '100%', justifyContent: 'center', fontSize: '13px', fontWeight: 600, marginBottom: '20px', transition: 'all 0.2s' }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'white'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-light)'}
      >
        <Plus size={16} /> Add New Option
      </button>

      {/* ── Save as Template ── */}
      {businessId && opts.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          {showSaveInput ? (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                className="modal-input"
                style={{ marginBottom: 0, flex: 1, fontSize: '13px', height: '38px' }}
                placeholder="Dropdown template name..."
                value={saveTemplateName}
                onChange={(e) => setSaveTemplateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && saveTemplateName.trim()) handleSaveDropdown();
                  if (e.key === 'Escape') { setShowSaveInput(false); setSaveTemplateName(''); }
                }}
                autoFocus
              />
              <button
                type="button"
                onClick={handleSaveDropdown}
                disabled={!saveTemplateName.trim() || isSaving}
                style={{
                  padding: '8px 16px', fontSize: '12px', fontWeight: 700,
                  borderRadius: '8px', border: 'none',
                  background: saveTemplateName.trim() ? 'var(--navy)' : 'var(--bg-light)',
                  color: saveTemplateName.trim() ? 'white' : 'var(--muted)',
                  cursor: saveTemplateName.trim() ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s', whiteSpace: 'nowrap'
                }}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => { setShowSaveInput(false); setSaveTemplateName(''); }}
                style={{ padding: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowSaveInput(true)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                width: '100%', padding: '10px', fontSize: '12px', fontWeight: 700,
                borderRadius: '8px', border: '1px dashed var(--border)',
                background: 'white', color: 'var(--navy)', cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--navy)'; e.currentTarget.style.background = 'var(--bg-light)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'white'; }}
            >
              <Save size={14} />
              Save Options as Template
            </button>
          )}
        </div>
      )}

      {columnData.length > 0 && (
        <div className="suggestions-section" style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <label className="modal-label" style={{ margin: 0, fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
              Suggestions from existing data
            </label>
            <button 
              type="button" 
              onClick={() => {
                const newOnes = columnData.filter(d => !opts.some(o => o.toLowerCase() === d.toLowerCase()));
                if (newOnes.length > 0) updateOpts([...opts, ...newOnes]);
              }}
              style={{ fontSize: '11px', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
            >
              Add All
            </button>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '10px' }}>
            These values are already present in this column. Click to add them as official options.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '120px', overflowY: 'auto', padding: '2px' }}>
            {columnData.map((data, idx) => {
              const isAlreadyOption = opts.some(o => o.toLowerCase() === data.toLowerCase());
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={isAlreadyOption}
                  onClick={() => updateOpts([...opts, data])}
                  style={{ 
                    padding: '6px 12px', 
                    fontSize: '12px', 
                    borderRadius: '20px', 
                    border: '1px solid var(--border)', 
                    background: isAlreadyOption ? 'var(--bg-light)' : 'white',
                    color: isAlreadyOption ? 'var(--muted)' : 'var(--navy)',
                    cursor: isAlreadyOption ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => { if (!isAlreadyOption) e.currentTarget.style.borderColor = 'var(--primary)'; }}
                  onMouseLeave={(e) => { if (!isAlreadyOption) e.currentTarget.style.borderColor = 'var(--border)'; }}
                >
                  {isAlreadyOption ? <Check size={12} /> : <Plus size={12} />}
                  {data}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface ColumnModalsProps {
  // New Column / Insert Column
  newColumnModal: boolean;
  setNewColumnModal: (v: boolean) => void;
  insertColModal: 'left' | 'right' | null;
  setInsertColModal: (v: 'left' | 'right' | null) => void;
  newColName: string;
  setNewColName: (v: string) => void;
  newColType: string;
  setNewColType: (v: string) => void;
  newColDropdownOpts: string;
  setNewColDropdownOpts: (v: string) => void;
  newColOptionColors?: Record<string, string>;
  setNewColOptionColors?: (colors: Record<string, string>) => void;
  newColFormula: string;
  setNewColFormula: (v: string) => void;
  addColumnMutation: any;
  insertColumnMutation: any;
  newColMinVal: string;
  setNewColMinVal: (v: string) => void;
  newColMaxVal: string;
  setNewColMaxVal: (v: string) => void;

  // Rename Column
  renameColModal: boolean;
  setRenameColModal: (v: boolean) => void;
  renameColValue: string;
  setRenameColValue: (v: string) => void;
  renameColumnMutation: any;

  // Dropdown Config
  dropdownConfigModal: boolean;
  setDropdownConfigModal: (v: boolean) => void;
  dropdownConfigOptions: string;
  setDropdownConfigOptions: (v: string) => void;
  dropdownConfigOptionColors?: Record<string, string>;
  setDropdownConfigOptionColors?: (colors: Record<string, string>) => void;
  updateDropdownMutation: any;

  // Change Type
  changeTypeModal: boolean;
  setChangeTypeModal: (v: boolean) => void;
  changeTypeValue: string;
  setChangeTypeValue: (v: string) => void;
  changeColumnTypeMutation: any;
  
  linkColumnModal: boolean;
  setLinkColumnModal: (v: boolean) => void;
  
  activeModalColId: number | null;

  allRegisters?: RegisterSummary[];
  allFolders?: Folder[];
  currentRegisterId?: number;

  COL_TYPES: any[];
  columns: any[];
  entries: any[];
  businessId?: number;
}

export function ColumnModals(props: ColumnModalsProps) {
  const {
    newColumnModal, setNewColumnModal, insertColModal, setInsertColModal,
    newColName, setNewColName, newColType, setNewColType,
    newColDropdownOpts, setNewColDropdownOpts, newColOptionColors = {}, setNewColOptionColors,
    newColFormula, setNewColFormula,
    newColMinVal, setNewColMinVal, newColMaxVal, setNewColMaxVal,
    addColumnMutation, insertColumnMutation,
    renameColModal, setRenameColModal, renameColValue, setRenameColValue, renameColumnMutation,
    dropdownConfigModal, setDropdownConfigModal, dropdownConfigOptions, setDropdownConfigOptions,
    dropdownConfigOptionColors = {}, setDropdownConfigOptionColors, updateDropdownMutation,
    changeTypeModal, setChangeTypeModal, changeTypeValue, setChangeTypeValue, changeColumnTypeMutation,
    linkColumnModal, setLinkColumnModal,
    activeModalColId,
    COL_TYPES, columns, entries,
    allRegisters, allFolders, currentRegisterId,
    businessId
  } = props;

  return (
    <>
      {/* ── Add New Column ── */}
      {newColumnModal && (
        <div className="modal-overlay" onClick={() => setNewColumnModal(false)}>
          <div className={`modal-content ${newColType === 'formula' ? 'modal-content--formula' : ''}`} onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Add New Column</h3>
            <label className="modal-label">Column Name</label>
            <input className="modal-input" value={newColName} onChange={(e) => setNewColName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && newColName.trim() && addColumnMutation.mutate()} placeholder="e.g. Amount" autoFocus />
            <label className="modal-label">Column Type</label>
            <div className="type-chips">
              {COL_TYPES.map((t) => (
                <button 
                  key={t.id} 
                  className={`type-chip ${newColType === t.id ? 'active' : ''}`} 
                  onClick={() => {
                    setNewColType(t.id);
                    if (t.id === 'yes_no' && !newColDropdownOpts) {
                      setNewColDropdownOpts('Yes,No');
                      if (setNewColOptionColors) setNewColOptionColors({ 'Yes': '#10b981', 'No': '#ef4444' });
                    } else if (t.id === 'status' && !newColDropdownOpts) {
                      setNewColDropdownOpts('Pending,In Progress,Completed,Cancelled');
                      if (setNewColOptionColors) setNewColOptionColors({ 'Pending': '#f59e0b', 'In Progress': '#3b82f6', 'Completed': '#10b981', 'Cancelled': '#ef4444' });
                    }
                  }}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
            {(newColType === 'dropdown' || newColType === 'yes_no' || newColType === 'status') && (
              <>
                <label className="modal-label" style={{ marginTop: '12px', display: 'block', marginBottom: '8px' }}>Options</label>
                <OptionsEditor 
                  value={newColDropdownOpts} 
                  onChange={setNewColDropdownOpts} 
                  optionColors={newColOptionColors}
                  onOptionColorsChange={setNewColOptionColors}
                  columnData={[]} // No column data for new column
                  businessId={businessId}
                />
              </>
            )}
            {newColType === 'formula' && (
              <FormulaBuilder 
                formula={newColFormula} 
                onChange={setNewColFormula} 
                columns={columns} 
                entries={entries}
                outputName={newColName}
                excludeId={activeModalColId}
                businessId={businessId}
              />
            )}
            {(newColType === 'currency' || newColType === 'number') && (
              <div style={{ marginTop: '12px' }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label className="modal-label" style={{ display: 'block', marginBottom: '6px' }}>Min Value</label>
                    <input 
                      type="number" 
                      className="modal-input" 
                      value={newColMinVal} 
                      onChange={(e) => setNewColMinVal(e.target.value)} 
                      placeholder="No limit" 
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="modal-label" style={{ display: 'block', marginBottom: '6px' }}>Max Value</label>
                    <input 
                      type="number" 
                      className="modal-input" 
                      value={newColMaxVal} 
                      onChange={(e) => setNewColMaxVal(e.target.value)} 
                      placeholder="No limit" 
                    />
                  </div>
                </div>
              </div>
            )}
            <div className="modal-actions">
              <button className="modal-cancel-btn" onClick={() => setNewColumnModal(false)}>Cancel</button>
              <button className="modal-confirm-btn" disabled={!newColName.trim()} onClick={() => addColumnMutation.mutate()}>
                Add Column
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rename Column ── */}
      {renameColModal && (
        <div className="modal-overlay" onClick={() => setRenameColModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Rename Column</h3>
            <input className="modal-input" value={renameColValue} onChange={(e) => setRenameColValue(e.target.value)} placeholder="New column name" autoFocus />
            <div className="modal-actions">
              <button className="modal-cancel-btn" onClick={() => setRenameColModal(false)}>Cancel</button>
              <button className="modal-confirm-btn" disabled={!renameColValue.trim()} onClick={() => renameColumnMutation.mutate()}>Rename</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Dropdown Config ── */}
      {dropdownConfigModal && (
        <div className="modal-overlay" onClick={() => setDropdownConfigModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Edit Dropdown Options</h3>
            <label className="modal-label" style={{ marginBottom: '8px', display: 'block' }}>Options</label>
            <OptionsEditor 
              value={dropdownConfigOptions} 
              onChange={setDropdownConfigOptions} 
              optionColors={dropdownConfigOptionColors}
              onOptionColorsChange={setDropdownConfigOptionColors}
              columnData={(() => {
                if (activeModalColId == null || !entries) return [];
                const colIdStr = activeModalColId.toString();
                const seen = new Set<string>();
                const unique: string[] = [];
                entries.forEach(e => {
                  const val = e.cells?.[colIdStr]?.trim();
                  if (val && !seen.has(val.toLowerCase())) {
                    seen.add(val.toLowerCase());
                    unique.push(val);
                  }
                });
                return unique;
              })()}
              businessId={businessId}
            />
            <div className="modal-actions">
              <button className="modal-cancel-btn" onClick={() => setDropdownConfigModal(false)}>Cancel</button>
              <button className="modal-confirm-btn" onClick={() => updateDropdownMutation.mutate()}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Change Type ── */}
      {changeTypeModal && (
        <div className="modal-overlay" onClick={() => setChangeTypeModal(false)}>
          <div className={`modal-content ${changeTypeValue === 'formula' ? 'modal-content--formula' : ''}`} onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Change Column Type</h3>
            <p className="modal-p-text">Changing the type may affect existing data in this column.</p>
            <div className="type-chips">
              {COL_TYPES.map((t) => (
                <button 
                  key={t.id} 
                  className={`type-chip ${changeTypeValue === t.id ? 'active' : ''}`} 
                  onClick={() => {
                    setChangeTypeValue(t.id);
                    if (t.id === 'yes_no' && !newColDropdownOpts) {
                      setNewColDropdownOpts('Yes,No');
                      if (setNewColOptionColors) setNewColOptionColors({ 'Yes': '#10b981', 'No': '#ef4444' });
                    } else if (t.id === 'status' && !newColDropdownOpts) {
                      setNewColDropdownOpts('Pending,In Progress,Completed,Cancelled');
                      if (setNewColOptionColors) setNewColOptionColors({ 'Pending': '#f59e0b', 'In Progress': '#3b82f6', 'Completed': '#10b981', 'Cancelled': '#ef4444' });
                    }
                  }}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {(changeTypeValue === 'dropdown' || changeTypeValue === 'yes_no' || changeTypeValue === 'status') && (
              <>
                <label className="modal-label" style={{ marginTop: '12px', display: 'block', marginBottom: '8px' }}>Options</label>
                <OptionsEditor 
                  value={newColDropdownOpts} 
                  onChange={setNewColDropdownOpts} 
                  optionColors={newColOptionColors}
                  onOptionColorsChange={setNewColOptionColors}
                  columnData={[]}
                  businessId={businessId}
                />
              </>
            )}

            {changeTypeValue === 'formula' && (
              <FormulaBuilder 
                formula={newColFormula} 
                onChange={setNewColFormula} 
                columns={columns} 
                entries={entries}
                outputName={newColName}
                excludeId={activeModalColId}
                businessId={businessId}
              />
            )}
            {(changeTypeValue === 'currency' || changeTypeValue === 'number') && (
              <div style={{ marginTop: '12px' }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label className="modal-label" style={{ display: 'block', marginBottom: '6px' }}>Min Value</label>
                    <input 
                      type="number" 
                      className="modal-input" 
                      value={newColMinVal} 
                      onChange={(e) => setNewColMinVal(e.target.value)} 
                      placeholder="No limit" 
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="modal-label" style={{ display: 'block', marginBottom: '6px' }}>Max Value</label>
                    <input 
                      type="number" 
                      className="modal-input" 
                      value={newColMaxVal} 
                      onChange={(e) => setNewColMaxVal(e.target.value)} 
                      placeholder="No limit" 
                    />
                  </div>
                </div>
              </div>
            )}
            <div className="modal-actions">
              <button className="modal-cancel-btn" onClick={() => {
                setChangeTypeModal(false);
                setNewColMinVal('');
                setNewColMaxVal('');
              }}>Cancel</button>
              <button className="modal-confirm-btn" onClick={() => changeColumnTypeMutation.mutate()}>Change Type</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Insert Column ── */}
      {insertColModal !== null && (
        <div className="modal-overlay" onClick={() => setInsertColModal(null)}>
          <div className={`modal-content ${newColType === 'formula' ? 'modal-content--formula' : ''}`} onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Insert Column {insertColModal === 'left' ? 'Left' : 'Right'}</h3>
            <label className="modal-label">Column Name</label>
            <input className="modal-input" value={newColName} onChange={(e) => setNewColName(e.target.value)} placeholder="e.g. Amount" autoFocus />
            <label className="modal-label">Column Type</label>
            <div className="type-chips">
              {COL_TYPES.map((t) => (
                <button 
                  key={t.id} 
                  className={`type-chip ${newColType === t.id ? 'active' : ''}`} 
                  onClick={() => {
                    setNewColType(t.id);
                    if (t.id === 'yes_no' && !newColDropdownOpts) {
                      setNewColDropdownOpts('Yes,No');
                      if (setNewColOptionColors) setNewColOptionColors({ 'Yes': '#10b981', 'No': '#ef4444' });
                    } else if (t.id === 'status' && !newColDropdownOpts) {
                      setNewColDropdownOpts('Pending,In Progress,Completed,Cancelled');
                      if (setNewColOptionColors) setNewColOptionColors({ 'Pending': '#f59e0b', 'In Progress': '#3b82f6', 'Completed': '#10b981', 'Cancelled': '#ef4444' });
                    }
                  }}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
            {(newColType === 'dropdown' || newColType === 'yes_no' || newColType === 'status') && (
              <>
                <label className="modal-label" style={{ marginTop: '12px', display: 'block', marginBottom: '8px' }}>Options</label>
                <OptionsEditor 
                  value={newColDropdownOpts} 
                  onChange={setNewColDropdownOpts} 
                  optionColors={newColOptionColors}
                  onOptionColorsChange={setNewColOptionColors}
                  columnData={(() => {
                    if (activeModalColId == null || !entries) return [];
                    const colIdStr = activeModalColId.toString();
                    const seen = new Set<string>();
                    const unique: string[] = [];
                    entries.forEach(e => {
                      const val = e.cells?.[colIdStr]?.trim();
                      if (val && !seen.has(val.toLowerCase())) {
                        seen.add(val.toLowerCase());
                        unique.push(val);
                      }
                    });
                    return unique;
                  })()}
                  businessId={businessId}
                />
              </>
            )}
            {newColType === 'formula' && (
              <FormulaBuilder 
                formula={newColFormula} 
                onChange={setNewColFormula} 
                columns={columns} 
                outputName={newColName}
                excludeId={activeModalColId}
                businessId={businessId}
              />
            )}
            {(newColType === 'currency' || newColType === 'number') && (
              <div style={{ marginTop: '12px' }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label className="modal-label" style={{ display: 'block', marginBottom: '6px' }}>Min Value</label>
                    <input 
                      type="number" 
                      className="modal-input" 
                      value={newColMinVal} 
                      onChange={(e) => setNewColMinVal(e.target.value)} 
                      placeholder="No limit" 
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="modal-label" style={{ display: 'block', marginBottom: '6px' }}>Max Value</label>
                    <input 
                      type="number" 
                      className="modal-input" 
                      value={newColMaxVal} 
                      onChange={(e) => setNewColMaxVal(e.target.value)} 
                      placeholder="No limit" 
                    />
                  </div>
                </div>
              </div>
            )}
            <div className="modal-actions">
              <button className="modal-cancel-btn" onClick={() => {
                setInsertColModal(null);
                setNewColMinVal('');
                setNewColMaxVal('');
              }}>Cancel</button>
              <button className="modal-confirm-btn" disabled={!newColName.trim()} onClick={() => {
                // Pre-calculate position HERE (click-time snapshot) before modal state is cleared
                const targetCol = columns.find(c => c.id === activeModalColId);
                const pos = targetCol
                  ? (insertColModal === 'left' ? targetCol.position : targetCol.position + 1)
                  : columns.length;
                insertColumnMutation.mutate({
                  pos,
                  name: newColName,
                  type: newColType,
                  dropdownOpts: newColDropdownOpts,
                  formula: newColFormula,
                  minVal: newColMinVal,
                  maxVal: newColMaxVal
                });
              }}>Insert Column</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Link Column ── */}
      {linkColumnModal && (
        <LinkColumnModal
          onClose={() => setLinkColumnModal(false)}
          allRegisters={allRegisters || []}
          allFolders={allFolders || []}
          currentRegisterId={currentRegisterId}
          sourceColumn={columns.find(c => c.id === activeModalColId)}
        />
      )}
    </>
  );
}

/** Self-contained Multi-Register Link Column modal — allows linking a column across multiple registers */
function LinkColumnModal({ onClose, allRegisters, allFolders, currentRegisterId, sourceColumn }: {
  onClose: () => void;
  allRegisters: RegisterSummary[];
  allFolders: Folder[];
  currentRegisterId?: number;
  sourceColumn?: any;
}) {
  const queryClient = useQueryClient();
  const availableRegisters = allRegisters.filter(r => r.id !== currentRegisterId);

  // Existing active links for this column
  const existingLinks = useMemo(() => {
    return getColumnLinks(sourceColumn);
  }, [sourceColumn]);

  const [existingLinkDetails, setExistingLinkDetails] = useState<Array<{
    registerId: number;
    columnId: number;
    registerName: string;
    columnName: string;
    role: string;
  }>>([]);
  const [loadingExisting, setLoadingExisting] = useState(false);

  useEffect(() => {
    if (!existingLinks || existingLinks.length === 0) {
      setExistingLinkDetails([]);
      return;
    }
    let isMounted = true;
    setLoadingExisting(true);
    Promise.all(
      existingLinks.map(async (link) => {
        try {
          const reg = await getRegister(link.registerId);
          const col = reg.columns?.find((c: any) => c.id === link.columnId);
          return {
            registerId: link.registerId,
            columnId: link.columnId,
            registerName: reg.name,
            columnName: col ? col.name : `Column #${link.columnId}`,
            role: link.role || 'source'
          };
        } catch {
          return {
            registerId: link.registerId,
            columnId: link.columnId,
            registerName: `Register #${link.registerId}`,
            columnName: `Column #${link.columnId}`,
            role: link.role || 'source'
          };
        }
      })
    ).then(res => {
      if (isMounted) {
        setExistingLinkDetails(res);
        setLoadingExisting(false);
      }
    });
    return () => { isMounted = false; };
  }, [existingLinks]);

  // Unlink a specific existing link
  const unlinkSpecificMutation = useMutation({
    mutationFn: async (target: { registerId: number; columnId: number }) => {
      await unlinkColumn(currentRegisterId!, sourceColumn.id, false, target.registerId, target.columnId);
    },
    onSuccess: (_, target) => {
      queryClient.invalidateQueries({ queryKey: ['register', currentRegisterId] });
      queryClient.invalidateQueries({ queryKey: ['register', target.registerId] });
      setExistingLinkDetails(prev => prev.filter(l => !(l.registerId === target.registerId && l.columnId === target.columnId)));
      toast.success('Link removed successfully');
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to remove link');
    }
  });

  // Dynamic Link Slots
  const [linkSlots, setLinkSlots] = useState<Array<{
    id: string;
    selectedRegisterId: string;
    selectedColumnId: string;
    targetColumns: ApiColumn[];
    loadingColumns: boolean;
    expandedFolders: Record<number, boolean>;
  }>>(() => [
    {
      id: 'slot-1',
      selectedRegisterId: '',
      selectedColumnId: '',
      targetColumns: [],
      loadingColumns: false,
      expandedFolders: {}
    }
  ]);

  const addSlot = () => {
    setLinkSlots(prev => [
      ...prev,
      {
        id: 'slot-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
        selectedRegisterId: '',
        selectedColumnId: '',
        targetColumns: [],
        loadingColumns: false,
        expandedFolders: {}
      }
    ]);
  };

  const removeSlot = (slotId: string) => {
    setLinkSlots(prev => prev.filter(s => s.id !== slotId));
  };

  const handleRegisterChange = async (slotId: string, regIdStr: string) => {
    setLinkSlots(prev => prev.map(s => {
      if (s.id !== slotId) return s;
      return {
        ...s,
        selectedRegisterId: regIdStr,
        selectedColumnId: '',
        targetColumns: [],
        loadingColumns: !!regIdStr
      };
    }));

    if (!regIdStr) return;

    try {
      const reg = await getRegister(Number(regIdStr));
      setLinkSlots(prev => prev.map(s => {
        if (s.id !== slotId) return s;
        return {
          ...s,
          targetColumns: reg.columns || [],
          loadingColumns: false
        };
      }));
    } catch (err) {
      console.error('Failed to load register columns:', err);
      setLinkSlots(prev => prev.map(s => {
        if (s.id !== slotId) return s;
        return { ...s, targetColumns: [], loadingColumns: false };
      }));
    }
  };

  const handleColumnChange = (slotId: string, colIdStr: string) => {
    setLinkSlots(prev => prev.map(s => s.id === slotId ? { ...s, selectedColumnId: colIdStr } : s));
  };

  const toggleFolderInSlot = (slotId: string, folderId: number) => {
    setLinkSlots(prev => prev.map(s => {
      if (s.id !== slotId) return s;
      return {
        ...s,
        expandedFolders: {
          ...s.expandedFolders,
          [folderId]: !s.expandedFolders[folderId]
        }
      };
    }));
  };

  const validSlots = linkSlots.filter(s => s.selectedRegisterId && s.selectedColumnId);

  const linkMutation = useMutation({
    mutationFn: async () => {
      const targets = validSlots.map(s => ({
        targetRegisterId: Number(s.selectedRegisterId),
        targetColumnId: Number(s.selectedColumnId)
      }));
      await linkMultipleColumns(currentRegisterId!, sourceColumn.id, targets);
      return targets;
    },
    onSuccess: (targets) => {
      queryClient.invalidateQueries({ queryKey: ['register', currentRegisterId] });
      targets.forEach(t => {
        queryClient.invalidateQueries({ queryKey: ['register', t.targetRegisterId] });
      });
      toast.success(`Successfully linked to ${targets.length} register${targets.length > 1 ? 's' : ''}!`);
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to link columns');
    }
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()} 
        style={{ maxWidth: '580px', width: '92%', maxHeight: '88vh', display: 'flex', flexDirection: 'column', padding: '24px' }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'rgba(79, 70, 229, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#4f46e5'
            }}>
              <LinkIcon size={20} />
            </div>
            <div>
              <h3 className="modal-title" style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Link Column</h3>
              <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 500 }}>Multi-Register Live Data Sync</span>
            </div>
          </div>
          <button 
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px', borderRadius: '6px' }}
          >
            <X size={18} />
          </button>
        </div>

        <p className="modal-p-text" style={{ fontSize: '13px', margin: '0 0 16px 0', lineHeight: '1.5' }}>
          Link <strong>"{sourceColumn?.name || 'this column'}"</strong> across multiple registers. Entries and cell updates will automatically synchronize in real-time.
        </p>

        {/* Scrollable Body */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* 1. Existing Active Links Section */}
          {existingLinkDetails.length > 0 && (
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Active Links ({existingLinkDetails.length})
                </span>
                <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  ● Live Syncing
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {existingLinkDetails.map((l, idx) => (
                  <div 
                    key={`${l.registerId}-${l.columnId}`} 
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      background: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <span style={{
                        background: '#eff6ff',
                        color: '#2563eb',
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        flexShrink: 0
                      }}>
                        Link {idx + 1}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          📂 {l.registerName}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                          Target Column: <strong style={{ color: '#334155' }}>{l.columnName}</strong>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => unlinkSpecificMutation.mutate({ registerId: l.registerId, columnId: l.columnId })}
                      disabled={unlinkSpecificMutation.isPending}
                      style={{
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        color: '#dc2626',
                        borderRadius: '6px',
                        padding: '5px 10px',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        flexShrink: 0
                      }}
                      title="Unlink this register"
                    >
                      <Trash2 size={13} /> Unlink
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. New Link Slots Builder */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a' }}>
                Add New Register Link(s)
              </span>
              <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                Select target register and destination column
              </span>
            </div>

            {linkSlots.map((slot, index) => {
              const linkNum = existingLinkDetails.length + index + 1;
              return (
                <div 
                  key={slot.id}
                  style={{
                    background: 'white',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '14px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                    position: 'relative'
                  }}
                >
                  {/* Slot Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
                        color: 'white',
                        fontSize: '11px',
                        fontWeight: 800,
                        padding: '2px 9px',
                        borderRadius: '12px'
                      }}>
                        Link {linkNum}
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>
                        Destination Configuration
                      </span>
                    </div>

                    {linkSlots.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSlot(slot.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#94a3b8',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '2px 4px',
                          borderRadius: '4px'
                        }}
                        title="Remove this link slot"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>

                  {/* Register Selection Folder Tree */}
                  <label className="modal-label" style={{ fontSize: '11.5px', marginBottom: '6px' }}>Select Target Register</label>
                  <div className="custom-folder-tree-container" style={{
                    maxHeight: '180px',
                    overflowY: 'auto',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    background: '#f8fafc',
                    padding: '8px',
                    marginBottom: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}>
                    {allFolders.map(folder => {
                      const folderRegisters = availableRegisters.filter(r => r.folderId === folder.id);
                      if (folderRegisters.length === 0) return null;
                      const isExpanded = slot.expandedFolders[folder.id];

                      return (
                        <div key={folder.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div 
                            onClick={() => toggleFolderInSlot(slot.id, folder.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '6px 10px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              background: 'white',
                              border: '1px solid #e2e8f0',
                              fontWeight: 700,
                              fontSize: '12px',
                              color: 'var(--navy)',
                              userSelect: 'none'
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', color: 'var(--muted)' }}>
                              {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', color: '#f59e0b' }}>
                              {isExpanded ? <FolderOpen size={15} /> : <FolderClosed size={15} />}
                            </span>
                            <span style={{ flex: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{folder.name}</span>
                            <span style={{ fontSize: '10px', color: 'var(--muted)', background: '#f1f5f9', padding: '1px 5px', borderRadius: '10px', fontWeight: 600 }}>
                              {folderRegisters.length}
                            </span>
                          </div>

                          {isExpanded && (
                            <div style={{ marginLeft: '18px', display: 'flex', flexDirection: 'column', gap: '3px', borderLeft: '2px dashed #cbd5e1', paddingLeft: '6px' }}>
                              {folderRegisters.map(reg => {
                                const isSelected = slot.selectedRegisterId === reg.id.toString();
                                return (
                                  <div
                                    key={reg.id}
                                    onClick={() => handleRegisterChange(slot.id, reg.id.toString())}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      padding: '6px 10px',
                                      borderRadius: '6px',
                                      cursor: 'pointer',
                                      fontSize: '12px',
                                      fontWeight: 600,
                                      background: isSelected ? 'rgba(79, 70, 229, 0.1)' : 'transparent',
                                      color: isSelected ? '#4338ca' : '#1e293b',
                                      border: isSelected ? '1px solid rgba(79, 70, 229, 0.25)' : '1px solid transparent'
                                    }}
                                  >
                                    <Database size={12} style={{ color: isSelected ? '#4338ca' : '#94a3b8' }} />
                                    <span style={{ flex: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{reg.name}</span>
                                    <span style={{ fontSize: '10px', opacity: 0.6 }}>({reg.entryCount} rows)</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Unassigned registers */}
                    {availableRegisters.filter(r => !r.folderId).length > 0 && (() => {
                      const unassignedRegs = availableRegisters.filter(r => !r.folderId);
                      const isExpanded = slot.expandedFolders[-1] ?? true;

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div 
                            onClick={() => toggleFolderInSlot(slot.id, -1)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '6px 10px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              background: 'white',
                              border: '1px solid #e2e8f0',
                              fontWeight: 700,
                              fontSize: '12px',
                              color: 'var(--navy)',
                              userSelect: 'none'
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', color: 'var(--muted)' }}>
                              {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', color: 'var(--muted)' }}>
                              {isExpanded ? <FolderOpen size={15} /> : <FolderClosed size={15} />}
                            </span>
                            <span style={{ flex: 1 }}>General / Unassigned</span>
                            <span style={{ fontSize: '10px', color: 'var(--muted)', background: '#f1f5f9', padding: '1px 5px', borderRadius: '10px', fontWeight: 600 }}>
                              {unassignedRegs.length}
                            </span>
                          </div>

                          {isExpanded && (
                            <div style={{ marginLeft: '18px', display: 'flex', flexDirection: 'column', gap: '3px', borderLeft: '2px dashed #cbd5e1', paddingLeft: '6px' }}>
                              {unassignedRegs.map(reg => {
                                const isSelected = slot.selectedRegisterId === reg.id.toString();
                                return (
                                  <div
                                    key={reg.id}
                                    onClick={() => handleRegisterChange(slot.id, reg.id.toString())}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      padding: '6px 10px',
                                      borderRadius: '6px',
                                      cursor: 'pointer',
                                      fontSize: '12px',
                                      fontWeight: 600,
                                      background: isSelected ? 'rgba(79, 70, 229, 0.1)' : 'transparent',
                                      color: isSelected ? '#4338ca' : '#1e293b',
                                      border: isSelected ? '1px solid rgba(79, 70, 229, 0.25)' : '1px solid transparent'
                                    }}
                                  >
                                    <Database size={12} style={{ color: isSelected ? '#4338ca' : '#94a3b8' }} />
                                    <span style={{ flex: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{reg.name}</span>
                                    <span style={{ fontSize: '10px', opacity: 0.6 }}>({reg.entryCount} rows)</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Target Column Selection */}
                  {slot.selectedRegisterId && (
                    <div>
                      <label className="modal-label" style={{ fontSize: '11.5px', marginBottom: '4px' }}>Select Target Column</label>
                      {slot.loadingColumns ? (
                        <div style={{ padding: '8px', fontSize: '12px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }}></span>
                          Loading columns...
                        </div>
                      ) : slot.targetColumns.length > 0 ? (
                        <select
                          className="modal-input"
                          value={slot.selectedColumnId}
                          onChange={(e) => handleColumnChange(slot.id, e.target.value)}
                          style={{ fontSize: '12.5px', padding: '8px 10px', height: '38px', borderRadius: '8px' }}
                        >
                          <option value="" disabled>Select a column in target register...</option>
                          {slot.targetColumns.map(col => (
                            <option key={col.id} value={col.id.toString()}>
                              {col.name} ({col.type})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div style={{ padding: '8px', fontSize: '12px', color: '#94a3b8', background: '#f8fafc', borderRadius: '6px', textAlign: 'center' }}>
                          No columns found in this register.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* + Add Another Register Link Button */}
            <button
              type="button"
              onClick={addSlot}
              style={{
                width: '100%',
                padding: '10px 16px',
                borderRadius: '10px',
                border: '1.5px dashed #6366f1',
                background: 'rgba(99, 102, 241, 0.04)',
                color: '#4f46e5',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s',
                marginTop: '4px'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.04)'; }}
            >
              <Plus size={16} /> Add Another Register Link ({`Link ${existingLinkDetails.length + linkSlots.length + 1}`})
            </button>
          </div>
        </div>

        {/* Modal Action Buttons */}
        <div className="modal-actions" style={{ marginTop: '20px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
          <button className="modal-cancel-btn" onClick={onClose}>Cancel</button>
          <button
            className="modal-confirm-btn"
            disabled={validSlots.length === 0 || linkMutation.isPending}
            onClick={() => linkMutation.mutate()}
            style={{
              background: validSlots.length > 0 ? 'linear-gradient(135deg, #1e3a8a, #3b82f6)' : undefined,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <LinkIcon size={14} />
            {linkMutation.isPending ? 'Linking...' : validSlots.length > 0 ? `Link ${validSlots.length} Register${validSlots.length > 1 ? 's' : ''}` : 'Link Column'}
          </button>
        </div>
      </div>
    </div>
  );
}
