import { useState } from 'react';
import { Sliders, FileText, CheckCircle2, AlertTriangle, Shield, Palette, Layout } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminGlobalRulesPage() {
  const [doubleEntryMinLen, setDoubleEntryMinLen] = useState('3');
  const [autoFitExcel, setAutoFitExcel] = useState(true);
  const [plainTextDates, setPlainTextDates] = useState(true);
  const [pdfWatermark, setPdfWatermark] = useState('CONFIDENTIAL - AG TRUST');
  const [allowBackDates, setAllowBackDates] = useState(false);

  const handleSaveRules = () => {
    toast.success('Global register rules & policy settings saved!');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: 'var(--navy)', letterSpacing: '-0.02em' }}>
            Global Register Rules & Policies
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13.5px', color: 'var(--muted)' }}>
            Configure double-entry validation sensitivity, export formatting defaults, and workspace constraints.
          </p>
        </div>

        <button
          onClick={handleSaveRules}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 18px',
            borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, var(--navy), var(--navy-light))',
            color: 'white', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
            boxShadow: 'var(--shadow-button)', transition: 'all 0.2s'
          }}
        >
          <Sliders size={15} />
          Save Global Rules
        </button>
      </div>

      {/* Rules Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        {/* Rule 1: Double Entry Threshold */}
        <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <h4 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 700, color: 'var(--foreground)' }}>Double Entry Detection Sensitivity</h4>
          <p style={{ margin: '0 0 12px 0', fontSize: '12.5px', color: 'var(--muted)' }}>
            Minimum character length typed before checking for duplicate entries in phone/ID fields.
          </p>
          <select
            value={doubleEntryMinLen}
            onChange={e => setDoubleEntryMinLen(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)',
              background: 'var(--bg-secondary)', color: 'var(--foreground)', fontSize: '13px', fontWeight: 600
            }}
          >
            <option value="2">2 Characters (High Sensitivity)</option>
            <option value="3">3 Characters (Default - Recommended)</option>
            <option value="5">5 Characters (Strict Match)</option>
          </select>
        </div>

        {/* Rule 2: Back-dated Entry Lock */}
        <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--foreground)' }}>Allow Back-Dated Entry Inputs</h4>
              <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--muted)', lineHeight: 1.4 }}>
                If disabled, non-admin users cannot select past dates when adding records.
              </p>
            </div>
            <input
              type="checkbox"
              checked={allowBackDates}
              onChange={e => setAllowBackDates(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--accent)' }}
            />
          </div>
        </div>

        {/* Rule 3: Excel Auto-Fit Columns */}
        <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--foreground)' }}>Excel Export Auto-Fit Columns</h4>
              <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#64748b', lineHeight: 1.4 }}>
                Automatically expand Excel column widths based on longest cell text length on download.
              </p>
            </div>
            <input
              type="checkbox"
              checked={autoFitExcel}
              onChange={e => setAutoFitExcel(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--accent)' }}
            />
          </div>
        </div>

        {/* Rule 4: Plain Text Date Formatting */}
        <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--foreground)' }}>Export Plain-Text String Dates</h4>
              <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--muted)', lineHeight: 1.4 }}>
                Export dates as verbatim string text to prevent Excel date auto-conversion corruption.
              </p>
            </div>
            <input
              type="checkbox"
              checked={plainTextDates}
              onChange={e => setPlainTextDates(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--accent)' }}
            />
          </div>
        </div>
      </div>

      {/* PDF Watermark Card */}
      <div style={{ background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--border)', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 700, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={18} color="#2563eb" /> PDF Document Branding & Watermark
        </h3>
        <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--muted)' }}>
          Custom header text displayed on top of exported PDF reports across all registers.
        </p>
        <input
          type="text"
          value={pdfWatermark}
          onChange={e => setPdfWatermark(e.target.value)}
          placeholder="Enter watermark text..."
          style={{
            width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)',
            background: 'var(--bg-secondary)', color: 'var(--foreground)', fontSize: '13.5px', fontWeight: 600,
            boxSizing: 'border-box'
          }}
        />
      </div>
    </div>
  );
}
