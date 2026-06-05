import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, Settings, Sliders, Activity, Database, HardDrive, 
  UploadCloud, Sparkles, Clock, Trash2, Check, AlertTriangle, RefreshCw
} from 'lucide-react';
import { ImageCompressionModule, type CompressionConfig, type CompressionStats, type CompressionResult } from '../../../lib/imageCompressionModule';
import { DataPersistenceModule, type LedgerItem, type ChunkCapacityInfo } from '../../../lib/dataPersistenceModule';
import { type Entry } from '../../../lib/api';

interface StorageOptimizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: Entry[];
  registerId: number;
  defaultTab?: 'analytics' | 'config' | 'sandbox' | 'chunks' | 'ledger';
}

export function StorageOptimizerModal({ isOpen, onClose, entries, registerId, defaultTab = 'analytics' }: StorageOptimizerModalProps) {
  const [activeTab, setActiveTab] = useState<'analytics' | 'config' | 'sandbox' | 'chunks' | 'ledger'>(defaultTab);
  
  useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab);
    }
  }, [isOpen, defaultTab]);
  
  // Compression state
  const [config, setConfig] = useState<CompressionConfig>(ImageCompressionModule.getConfig());
  const [stats, setStats] = useState<CompressionStats>(ImageCompressionModule.getStats());
  
  // Sandbox states
  const [sandboxFile, setSandboxFile] = useState<File | null>(null);
  const [sandboxResult, setSandboxResult] = useState<CompressionResult | null>(null);
  const [sandboxLoading, setSandboxLoading] = useState(false);
  const [sandboxError, setSandboxError] = useState<string | null>(null);

  // Persistence layer states
  const [ledger, setLedger] = useState<LedgerItem[]>(DataPersistenceModule.getLedger());
  const [chunks, setChunks] = useState<ChunkCapacityInfo[]>(DataPersistenceModule.getChunkCapacities(entries));
  const [selectedChunk, setSelectedChunk] = useState<ChunkCapacityInfo | null>(null);

  // Subscribe to ledger updates
  useEffect(() => {
    if (!isOpen) return;
    const unsubscribe = DataPersistenceModule.subscribe((updatedLedger) => {
      setLedger(updatedLedger);
    });
    return unsubscribe;
  }, [isOpen]);

  // Recalculate chunks when modal opens or entries change
  useEffect(() => {
    if (isOpen) {
      const capacities = DataPersistenceModule.getChunkCapacities(entries);
      setChunks(capacities);
      setStats(ImageCompressionModule.getStats());
      if (selectedChunk) {
        const updated = capacities.find(c => c.chunkIndex === selectedChunk.chunkIndex);
        setSelectedChunk(updated || null);
      }
    }
  }, [isOpen, entries]);

  // Trigger compression in sandbox when file or configs change
  useEffect(() => {
    if (!sandboxFile) return;

    setSandboxLoading(true);
    setSandboxError(null);

    ImageCompressionModule.testCompress(sandboxFile, config)
      .then((res) => {
        setSandboxResult(res);
      })
      .catch((err) => {
        setSandboxError(err?.message || 'Compression failed');
      })
      .finally(() => {
        setSandboxLoading(false);
      });
  }, [sandboxFile, config]);

  if (!isOpen) return null;

  const handleConfigChange = (updated: Partial<CompressionConfig>) => {
    ImageCompressionModule.saveConfig(updated);
    setConfig(ImageCompressionModule.getConfig());
  };

  const handleResetStats = () => {
    if (window.confirm('Are you sure you want to reset all compression stats? This cannot be undone.')) {
      ImageCompressionModule.resetStats();
      setStats(ImageCompressionModule.getStats());
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTime = (ts: number): string => {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return createPortal(
    <div className="storage-opt-overlay" onClick={onClose}>
      <style>{`
        .storage-opt-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(15, 23, 42, 0.45);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10050;
          animation: optFadeIn 0.25s ease-out;
        }

        .storage-opt-container {
          width: 960px;
          max-width: 95vw;
          height: 640px;
          max-height: 90vh;
          background: #ffffff;
          border-radius: 20px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 40px rgba(16, 185, 129, 0.05);
          display: flex;
          overflow: hidden;
          border: 1px solid rgba(226, 232, 240, 0.8);
          font-family: 'Inter', -apple-system, sans-serif;
          animation: optSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes optFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes optSlideUp {
          from { transform: translateY(30px) scale(0.97); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }

        /* Dual-Column layout: Sidebar + Content */
        .storage-opt-sidebar {
          width: 250px;
          background: #f8fafc;
          border-right: 1px solid #edf2f7;
          display: flex;
          flex-direction: column;
          padding: 24px 16px;
          justify-content: space-between;
        }

        .storage-opt-sidebar-top {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .storage-opt-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 8px;
        }

        .storage-opt-brand-icon {
          background: linear-gradient(135deg, #10b981, #059669);
          color: white;
          padding: 8px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 10px rgba(16, 185, 129, 0.3);
        }

        .storage-opt-brand-title {
          font-size: 16px;
          font-weight: 700;
          color: #0f172a;
          line-height: 1.2;
        }

        .storage-opt-brand-sub {
          font-size: 11px;
          color: #64748b;
          font-weight: 500;
        }

        .storage-opt-menu {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .storage-opt-menu-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          border-radius: 10px;
          border: none;
          background: transparent;
          color: #475569;
          font-size: 13px;
          font-weight: 600;
          text-align: left;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .storage-opt-menu-item:hover {
          background: #f1f5f9;
          color: #0f172a;
        }

        .storage-opt-menu-item.active {
          background: rgba(16, 185, 129, 0.1);
          color: #047857;
        }

        .storage-opt-sidebar-footer {
          background: white;
          padding: 12px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .storage-opt-db-badge {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
        }

        .storage-opt-db-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 8px #10b981;
        }

        .storage-opt-db-indicator.saving {
          background: #f59e0b;
          box-shadow: 0 0 8px #f59e0b;
          animation: optPulse 1s infinite alternate;
        }

        @keyframes optPulse {
          from { opacity: 0.4; }
          to { opacity: 1; }
        }

        .storage-opt-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: #ffffff;
          overflow: hidden;
        }

        .storage-opt-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 32px;
          border-bottom: 1px solid #f1f5f9;
        }

        .storage-opt-title-group h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
          color: #0f172a;
        }

        .storage-opt-title-group p {
          margin: 4px 0 0 0;
          font-size: 12px;
          color: #64748b;
        }

        .storage-opt-close-btn {
          border: none;
          background: #f1f5f9;
          color: #64748b;
          padding: 8px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .storage-opt-close-btn:hover {
          background: #e2e8f0;
          color: #0f172a;
          transform: rotate(90deg);
        }

        .storage-opt-body {
          flex: 1;
          padding: 24px 32px;
          overflow-y: auto;
          background: #fafafb;
          position: relative;
        }

        /* ── Analytics Styles ── */
        .opt-analytics-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }

        .opt-card {
          background: white;
          padding: 20px;
          border-radius: 14px;
          border: 1px solid #edf2f7;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px -1px rgba(0, 0, 0, 0.01);
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .opt-card-icon {
          padding: 12px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .opt-card-info {
          display: flex;
          flex-direction: column;
        }

        .opt-card-label {
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .opt-card-value {
          font-size: 20px;
          font-weight: 700;
          color: #0f172a;
          margin-top: 4px;
        }

        .opt-chart-panel {
          background: white;
          padding: 24px;
          border-radius: 16px;
          border: 1px solid #edf2f7;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .opt-panel-title {
          font-size: 14px;
          font-weight: 700;
          color: #0f172a;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .opt-bar-container {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .opt-bar-label-row {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          font-weight: 600;
          color: #475569;
        }

        .opt-bar-track {
          width: 100%;
          height: 24px;
          background: #f1f5f9;
          border-radius: 8px;
          overflow: hidden;
          position: relative;
        }

        .opt-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #10b981, #34d399);
          border-radius: 8px;
          transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .opt-bar-overlay-text {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 11px;
          font-weight: 700;
          color: #0f172a;
        }

        .opt-action-bar {
          display: flex;
          justify-content: flex-end;
          margin-top: 16px;
        }

        .opt-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
          background: white;
          color: #334155;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .opt-btn:hover {
          background: #f8fafc;
          border-color: #94a3b8;
          color: #0f172a;
        }

        .opt-btn.danger {
          color: #ef4444;
          border-color: #fca5a5;
        }

        .opt-btn.danger:hover {
          background: #fef2f2;
          border-color: #f87171;
        }

        /* ── Configuration Styles ── */
        .opt-config-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
          background: white;
          padding: 24px;
          border-radius: 16px;
          border: 1px solid #edf2f7;
        }

        .opt-input-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .opt-input-label-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .opt-input-label {
          font-size: 13px;
          font-weight: 700;
          color: #334155;
        }

        .opt-value-badge {
          background: rgba(16, 185, 129, 0.1);
          color: #047857;
          font-size: 11px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 6px;
        }

        .opt-slider {
          -webkit-appearance: none;
          width: 100%;
          height: 6px;
          border-radius: 3px;
          background: #e2e8f0;
          outline: none;
          cursor: pointer;
        }

        .opt-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #10b981;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          transition: transform 0.1s ease;
        }

        .opt-slider::-webkit-slider-thumb:hover {
          transform: scale(1.15);
        }

        .opt-checkbox-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 0;
          cursor: pointer;
        }

        .opt-checkbox {
          width: 16px;
          height: 16px;
          accent-color: #10b981;
        }

        .opt-checkbox-desc {
          font-size: 12px;
          color: #64748b;
          line-height: 1.4;
          margin-top: 2px;
        }

        /* ── Sandbox Styles ── */
        .sandbox-layout {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .sandbox-dropzone {
          border: 2px dashed #cbd5e1;
          background: white;
          padding: 32px;
          border-radius: 16px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }

        .sandbox-dropzone:hover {
          border-color: #10b981;
          background: rgba(16, 185, 129, 0.01);
        }

        .sandbox-dropzone-icon {
          color: #94a3b8;
          transition: color 0.2s ease;
        }

        .sandbox-dropzone:hover .sandbox-dropzone-icon {
          color: #10b981;
          transform: translateY(-2px);
        }

        .sandbox-dropzone p {
          margin: 0;
          font-size: 13px;
          font-weight: 600;
          color: #475569;
        }

        .sandbox-dropzone span {
          font-size: 11px;
          color: #94a3b8;
        }

        .sandbox-results {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }

        .sandbox-column {
          background: white;
          border-radius: 16px;
          border: 1px solid #edf2f7;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .sandbox-column-header {
          padding: 12px 16px;
          background: #f8fafc;
          border-bottom: 1px solid #edf2f7;
          font-size: 12px;
          font-weight: 700;
          color: #475569;
          display: flex;
          justify-content: space-between;
        }

        .sandbox-img-container {
          flex: 1;
          height: 220px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f1f5f9;
          position: relative;
        }

        .sandbox-img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
        }

        .sandbox-info-panel {
          padding: 16px;
          border-top: 1px solid #edf2f7;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .sandbox-stat-item {
          display: flex;
          flex-direction: column;
        }

        .sandbox-stat-label {
          font-size: 10px;
          font-weight: 600;
          color: #94a3b8;
          text-transform: uppercase;
        }

        .sandbox-stat-value {
          font-size: 13px;
          font-weight: 700;
          color: #334155;
          margin-top: 2px;
        }

        .sandbox-stat-value.success {
          color: #10b981;
        }

        /* ── Chunks Styles ── */
        .chunks-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }

        .chunk-card {
          background: white;
          border-radius: 14px;
          border: 1px solid #edf2f7;
          padding: 16px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .chunk-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.04);
          border-color: #10b981;
        }

        .chunk-card.selected {
          border-color: #10b981;
          background: rgba(16, 185, 129, 0.01);
          box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.15);
        }

        .chunk-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .chunk-title {
          font-size: 13px;
          font-weight: 700;
          color: #0f172a;
        }

        .chunk-rows {
          font-size: 11px;
          color: #64748b;
          font-weight: 500;
        }

        .chunk-usage-bar {
          height: 8px;
          border-radius: 4px;
          background: #f1f5f9;
          overflow: hidden;
          width: 100%;
        }

        .chunk-usage-fill {
          height: 100%;
          border-radius: 4px;
          transition: width 0.3s ease;
        }

        .chunk-percentage-row {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          font-weight: 600;
          color: #475569;
        }

        .chunk-details-panel {
          background: white;
          border-radius: 16px;
          border: 1px solid #edf2f7;
          padding: 20px;
          animation: optFadeIn 0.3s ease-out;
        }

        .chunk-heavy-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 150px;
          overflow-y: auto;
          margin-top: 12px;
        }

        .chunk-heavy-item {
          display: flex;
          justify-content: space-between;
          padding: 8px 12px;
          border-radius: 8px;
          background: #f8fafc;
          font-size: 12px;
          font-weight: 500;
          color: #475569;
        }

        .chunk-heavy-item.danger {
          background: #fff5f5;
          color: #c53030;
          border-left: 3px solid #f56565;
        }

        /* ── Ledger Styles ── */
        .ledger-table-container {
          background: white;
          border-radius: 16px;
          border: 1px solid #edf2f7;
          overflow: hidden;
        }

        .ledger-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .ledger-th {
          background: #f8fafc;
          padding: 12px 16px;
          font-size: 11px;
          font-weight: 700;
          color: #475569;
          text-transform: uppercase;
          border-bottom: 1px solid #edf2f7;
        }

        .ledger-td {
          padding: 12px 16px;
          font-size: 12px;
          color: #334155;
          border-bottom: 1px solid #f1f5f9;
        }

        .ledger-status-badge {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .ledger-status-badge.pending {
          background: rgba(59, 130, 246, 0.1);
          color: #1d4ed8;
        }

        .ledger-status-badge.persisting {
          background: rgba(245, 158, 11, 0.1);
          color: #b45309;
        }

        .ledger-status-badge.success {
          background: rgba(16, 185, 129, 0.1);
          color: #047857;
        }

        .ledger-status-badge.failed {
          background: rgba(239, 68, 68, 0.1);
          color: #b91c1c;
        }

        .ledger-no-data {
          padding: 32px;
          text-align: center;
          color: #94a3b8;
          font-size: 12px;
        }
      `}</style>

      <div className="storage-opt-container" onClick={(e) => e.stopPropagation()}>
        {/* Left Column: Sidebar Menu */}
        <div className="storage-opt-sidebar">
          <div className="storage-opt-sidebar-top">
            <div className="storage-opt-brand">
              <div className="storage-opt-brand-icon">
                <HardDrive size={18} />
              </div>
              <div className="storage-opt-brand-info">
                <div className="storage-opt-brand-title">Optimizer</div>
                <div className="storage-opt-brand-sub">Image & Storage DB</div>
              </div>
            </div>

            <div className="storage-opt-menu">
              <button 
                className={`storage-opt-menu-item${activeTab === 'analytics' ? ' active' : ''}`}
                onClick={() => { setActiveTab('analytics'); setSelectedChunk(null); }}
              >
                <Activity size={15} />
                <span>Storage Dashboard</span>
              </button>
              <button 
                className={`storage-opt-menu-item${activeTab === 'config' ? ' active' : ''}`}
                onClick={() => { setActiveTab('config'); setSelectedChunk(null); }}
              >
                <Sliders size={15} />
                <span>Compression Setup</span>
              </button>
              <button 
                className={`storage-opt-menu-item${activeTab === 'sandbox' ? ' active' : ''}`}
                onClick={() => { setActiveTab('sandbox'); setSelectedChunk(null); }}
              >
                <Sparkles size={15} />
                <span>Interactive Sandbox</span>
              </button>
              <button 
                className={`storage-opt-menu-item${activeTab === 'chunks' ? ' active' : ''}`}
                onClick={() => { setActiveTab('chunks'); setSelectedChunk(null); }}
              >
                <Database size={15} />
                <span>Database Chunks</span>
              </button>
              <button 
                className={`storage-opt-menu-item${activeTab === 'ledger' ? ' active' : ''}`}
                onClick={() => { setActiveTab('ledger'); setSelectedChunk(null); }}
              >
                <Clock size={15} />
                <span>Active Sync Ledger</span>
              </button>
            </div>
          </div>

          <div className="storage-opt-sidebar-footer">
            <div className="storage-opt-db-badge">
              <span>Database Sync</span>
              <div className={`storage-opt-db-indicator${ledger.some(l => l.status === 'pending' || l.status === 'persisting') ? ' saving' : ''}`} />
            </div>
            <div style={{ fontSize: '10px', color: '#94a3b8', lineHeight: 1.3 }}>
              {ledger.some(l => l.status === 'pending' || l.status === 'persisting') 
                ? 'Syncing changes in background...' 
                : 'All grid transactions fully synced.'
              }
            </div>
          </div>
        </div>

        {/* Right Column: Content Panel */}
        <div className="storage-opt-content">
          <div className="storage-opt-header">
            <div className="storage-opt-title-group">
              {activeTab === 'analytics' && (
                <>
                  <h2>Storage Dashboard</h2>
                  <p>Understand how much Firestore chunk storage space you have saved.</p>
                </>
              )}
              {activeTab === 'config' && (
                <>
                  <h2>Compression Parameters</h2>
                  <p>Fine-tune maximum boundaries and quality modifiers for all photo uploads.</p>
                </>
              )}
              {activeTab === 'sandbox' && (
                <>
                  <h2>Compression Sandbox</h2>
                  <p>Drag in an image to test dimensions and quality settings without committing.</p>
                </>
              )}
              {activeTab === 'chunks' && (
                <>
                  <h2>Database Chunks Monitor</h2>
                  <p>Analyze how close each 50-row subcollection chunk document is to the 1MB Firestore limit.</p>
                </>
              )}
              {activeTab === 'ledger' && (
                <>
                  <h2>Active Sync Ledger</h2>
                  <p>Trace background writes and transaction queues to verify database integrity.</p>
                </>
              )}
            </div>
            <button className="storage-opt-close-btn" onClick={onClose} aria-label="Close dialog">
              <X size={16} />
            </button>
          </div>

          <div className="storage-opt-body">
            {/* 📊 ANALYTICS TAB */}
            {activeTab === 'analytics' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="opt-analytics-grid">
                  <div className="opt-card">
                    <div className="opt-card-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                      <Check size={20} />
                    </div>
                    <div className="opt-card-info">
                      <span className="opt-card-label">Compressed Photos</span>
                      <span className="opt-card-value">{stats.imagesCompressedCount}</span>
                    </div>
                  </div>

                  <div className="opt-card">
                    <div className="opt-card-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                      <HardDrive size={20} />
                    </div>
                    <div className="opt-card-info">
                      <span className="opt-card-label">Cumulative Savings</span>
                      <span className="opt-card-value">
                        {formatBytes(Math.max(0, stats.originalSizeTotal - stats.compressedSizeTotal))}
                      </span>
                    </div>
                  </div>

                  <div className="opt-card">
                    <div className="opt-card-icon" style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
                      <Sparkles size={20} />
                    </div>
                    <div className="opt-card-info">
                      <span className="opt-card-label">Compression Ratio</span>
                      <span className="opt-card-value">
                        {stats.originalSizeTotal > 0 
                          ? (((stats.originalSizeTotal - stats.compressedSizeTotal) / stats.originalSizeTotal) * 100).toFixed(1) + '%'
                          : '90.0%'
                        }
                      </span>
                    </div>
                  </div>
                </div>

                <div className="opt-chart-panel">
                  <div className="opt-panel-title">
                    <Database size={15} style={{ color: '#10b981' }} />
                    <span>Estimated Physical Storage Burden</span>
                  </div>

                  <div className="opt-bar-container">
                    <div className="opt-bar-label-row">
                      <span>Without Compression (Raw Base64)</span>
                      <span>{formatBytes(stats.originalSizeTotal || 1024 * 1024 * 3.4)}</span>
                    </div>
                    <div className="opt-bar-track">
                      <div className="opt-bar-fill" style={{ width: '100%', background: '#94a3b8' }} />
                      <span className="opt-bar-overlay-text" style={{ color: 'white' }}>100% Raw Volume</span>
                    </div>
                  </div>

                  <div className="opt-bar-container">
                    <div className="opt-bar-label-row">
                      <span>Optimized Size (Centralized Compression Module)</span>
                      <span>{formatBytes(stats.compressedSizeTotal || 1024 * 45)}</span>
                    </div>
                    <div className="opt-bar-track">
                      <div 
                        className="opt-bar-fill" 
                        style={{ 
                          width: stats.originalSizeTotal > 0 
                            ? `${Math.max(2, (stats.compressedSizeTotal / stats.originalSizeTotal) * 100)}%` 
                            : '2.5%' 
                        }} 
                      />
                      <span className="opt-bar-overlay-text">
                        {stats.originalSizeTotal > 0 
                          ? (stats.compressedSizeTotal / stats.originalSizeTotal * 100).toFixed(1) + '% Space Used'
                          : '2.5% Space Used'
                        }
                      </span>
                    </div>
                  </div>
                </div>

                <div className="opt-action-bar">
                  <button className="opt-btn danger" onClick={handleResetStats}>
                    <Trash2 size={13} />
                    Reset Compression Metrics
                  </button>
                </div>
              </div>
            )}

            {/* ⚙️ SETUP TAB */}
            {activeTab === 'config' && (
              <div className="opt-config-form">
                <div className="opt-input-group">
                  <div className="opt-input-label-row">
                    <label className="opt-input-label">Maximum Width Boundary</label>
                    <span className="opt-value-badge">{config.maxWidth} px</span>
                  </div>
                  <input 
                    type="range" 
                    min="300" 
                    max="1200" 
                    step="50"
                    value={config.maxWidth} 
                    onChange={(e) => handleConfigChange({ maxWidth: parseInt(e.target.value) })}
                    className="opt-slider"
                  />
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    Rescales wide files to fit this horizontal boundary. Keeping width small ensures low database sizes.
                  </span>
                </div>

                <div className="opt-input-group">
                  <div className="opt-input-label-row">
                    <label className="opt-input-label">Maximum Height Boundary</label>
                    <span className="opt-value-badge">{config.maxHeight} px</span>
                  </div>
                  <input 
                    type="range" 
                    min="300" 
                    max="1200" 
                    step="50"
                    value={config.maxHeight} 
                    onChange={(e) => handleConfigChange({ maxHeight: parseInt(e.target.value) })}
                    className="opt-slider"
                  />
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    Rescales tall files to fit this vertical boundary, preserving aspect ratios correctly.
                  </span>
                </div>

                <div className="opt-input-group">
                  <div className="opt-input-label-row">
                    <label className="opt-input-label">Base Compression Quality</label>
                    <span className="opt-value-badge">{Math.round(config.quality * 100)} %</span>
                  </div>
                  <input 
                    type="range" 
                    min="0.1" 
                    max="0.9" 
                    step="0.05"
                    value={config.quality} 
                    onChange={(e) => handleConfigChange({ quality: parseFloat(e.target.value) })}
                    className="opt-slider"
                  />
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    Standard JPEG/WebP quality percentage. Lowering this slightly yields substantial space gains.
                  </span>
                </div>

                <div style={{ borderTop: '1px solid #edf2f7', paddingTop: '10px' }}>
                  <label className="opt-checkbox-row">
                    <input 
                      type="checkbox" 
                      checked={config.autoQualityScale} 
                      onChange={(e) => handleConfigChange({ autoQualityScale: e.target.checked })}
                      className="opt-checkbox"
                    />
                    <div>
                      <span className="opt-input-label">Enable Intelligent Quality Scaling</span>
                      <div className="opt-checkbox-desc">
                        Automatically reduces quality for very large files (&gt;2MB) to enforce database safety, and preserves higher resolution for smaller icons (&lt;50KB).
                      </div>
                    </div>
                  </label>
                </div>

                <div className="opt-input-group" style={{ borderTop: '1px solid #edf2f7', paddingTop: '16px' }}>
                  <div className="opt-input-label-row">
                    <label className="opt-input-label">Target Format</label>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                    {(['jpeg', 'webp', 'png'] as const).map((fmt) => (
                      <button
                        key={fmt}
                        className={`opt-btn${config.convertToFormat === fmt ? ' active' : ''}`}
                        onClick={() => handleConfigChange({ convertToFormat: fmt })}
                        style={config.convertToFormat === fmt ? { borderColor: '#10b981', color: '#047857', background: 'rgba(16, 185, 129, 0.05)' } : {}}
                      >
                        {fmt.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                    Converting PNG/GIF screenshots to highly compressed JPEG/WebP strings maximizes efficiency.
                  </span>
                </div>
              </div>
            )}

            {/* 🧪 SANDBOX TAB */}
            {activeTab === 'sandbox' && (
              <div className="sandbox-layout">
                <label className="sandbox-dropzone">
                  <input 
                    type="file" 
                    accept="image/*" 
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const files = e.target.files;
                      if (files && files.length > 0) {
                        setSandboxFile(files[0]);
                      }
                    }}
                  />
                  <UploadCloud size={32} className="sandbox-dropzone-icon" />
                  <p>Select or drag and drop any image file to test compression</p>
                  <span>Supports JPEG, PNG, WEBP, GIF (up to 15MB)</span>
                </label>

                {sandboxLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '32px' }}>
                    <RefreshCw size={20} className="saving" style={{ color: '#10b981', animation: 'optPulse 1s infinite alternate' }} />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Running diagnostic compression...</span>
                  </div>
                )}

                {sandboxError && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '16px', borderRadius: '12px', color: '#b91c1c', display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <AlertTriangle size={16} />
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>{sandboxError}</span>
                  </div>
                )}

                {sandboxResult && !sandboxLoading && (
                  <div className="sandbox-results">
                    <div className="sandbox-column">
                      <div className="sandbox-column-header">
                        <span>ORIGINAL FILE</span>
                        <span>{formatBytes(sandboxResult.originalSize)}</span>
                      </div>
                      <div className="sandbox-img-container">
                        <img src={sandboxResult.originalDataUrl} className="sandbox-img" alt="Original sandbox preview" />
                      </div>
                      <div className="sandbox-info-panel">
                        <div className="sandbox-stat-item">
                          <span className="sandbox-stat-label">File Type</span>
                          <span className="sandbox-stat-value">{sandboxFile?.type.split('/')[1].toUpperCase()}</span>
                        </div>
                        <div className="sandbox-stat-item">
                          <span className="sandbox-stat-label">Original KB</span>
                          <span className="sandbox-stat-value">{(sandboxResult.originalSize / 1024).toFixed(1)} KB</span>
                        </div>
                      </div>
                    </div>

                    <div className="sandbox-column">
                      <div className="sandbox-column-header" style={{ borderLeft: '2px solid #10b981' }}>
                        <span style={{ color: '#047857' }}>COMPRESSED MODULE</span>
                        <span className="success">{formatBytes(sandboxResult.compressedSize)}</span>
                      </div>
                      <div className="sandbox-img-container">
                        <img src={sandboxResult.compressedDataUrl} className="sandbox-img" alt="Compressed sandbox preview" />
                      </div>
                      <div className="sandbox-info-panel">
                        <div className="sandbox-stat-item">
                          <span className="sandbox-stat-label">Saving %</span>
                          <span className="sandbox-stat-value success">-{sandboxResult.ratio}%</span>
                        </div>
                        <div className="sandbox-stat-item">
                          <span className="sandbox-stat-label">Process Latency</span>
                          <span className="sandbox-stat-value" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={12} style={{ color: '#94a3b8' }} /> {sandboxResult.timeTakenMs} ms
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 🗄️ DATABASE CHUNKS MONITOR */}
            {activeTab === 'chunks' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="chunks-grid">
                  {chunks.map((c) => {
                    // Decide colors based on fill percentages
                    let fillCol = '#10b981'; // safe green
                    if (c.percentage > 85) fillCol = '#ef4444'; // danger red
                    else if (c.percentage > 60) fillCol = '#f59e0b'; // warning amber

                    const isSelected = selectedChunk?.chunkIndex === c.chunkIndex;

                    return (
                      <div 
                        key={c.chunkIndex} 
                        className={`chunk-card${isSelected ? ' selected' : ''}`}
                        onClick={() => setSelectedChunk(c)}
                      >
                        <div className="chunk-card-header">
                          <span className="chunk-title">Chunk {c.chunkIndex}</span>
                          <span className="chunk-rows">{c.entryCount} rows loaded</span>
                        </div>
                        <div className="chunk-usage-bar">
                          <div className="chunk-usage-fill" style={{ width: `${c.percentage}%`, background: fillCol }} />
                        </div>
                        <div className="chunk-percentage-row">
                          <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                            {parseFloat((c.estimatedSizeByte / 1024).toFixed(1))} KB / 1024.0 KB
                          </span>
                          <span style={{ color: fillCol }}>{c.percentage}%</span>
                        </div>
                      </div>
                    );
                  })}
                  {chunks.length === 0 && (
                    <div style={{ gridColumn: 'span 2', padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                      No subcollection chunks active yet. Add entries to populate database mapping.
                    </div>
                  )}
                </div>

                {selectedChunk && (
                  <div className="chunk-details-panel">
                    <div className="opt-panel-title" style={{ display: 'flex', justifyContent: 'between', width: '100%', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Database size={15} style={{ color: '#10b981' }} />
                        <span>Breakdown: Chunk {selectedChunk.chunkIndex} Details</span>
                      </div>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500, marginLeft: 'auto' }}>
                        Total capacity: {selectedChunk.percentage}% used
                      </span>
                    </div>

                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
                      {selectedChunk.heavyEntries.length > 0 
                        ? 'The following rows contain large image base64 strings contributing to this chunk capacity:'
                        : 'Congratulations! No heavy entries (image strings > 30KB) were detected inside this chunk.'
                      }
                    </div>

                    {selectedChunk.heavyEntries.length > 0 && (
                      <div className="chunk-heavy-list">
                        {selectedChunk.heavyEntries.map((h, i) => (
                          <div key={i} className={`chunk-heavy-item${h.sizeByte > 100 * 1024 ? ' danger' : ''}`}>
                            <span>Row #{h.rowNumber}</span>
                            <span style={{ fontWeight: 700 }}>
                              {parseFloat((h.sizeByte / 1024).toFixed(1))} KB 
                              {h.sizeByte > 100 * 1024 && ' (⚠️ HEAVY PAYLOAD)'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 🧾 ACTIVE LEDGER TAB */}
            {activeTab === 'ledger' && (
              <div className="ledger-table-container">
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th className="ledger-th">Sync Action</th>
                      <th className="ledger-th">Target Chunk</th>
                      <th className="ledger-th">Data Size</th>
                      <th className="ledger-th">Timestamp</th>
                      <th className="ledger-th">Sync Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((item) => (
                      <tr key={item.id}>
                        <td className="ledger-td" style={{ fontWeight: 600 }}>{item.action}</td>
                        <td className="ledger-td">Subcollection Chunks / {item.chunkIndex}</td>
                        <td className="ledger-td">{item.sizeKb} KB</td>
                        <td className="ledger-td">{formatTime(item.timestamp)}</td>
                        <td className="ledger-td">
                          <span className={`ledger-status-badge ${item.status}`}>
                            {item.status}
                          </span>
                          {item.status === 'failed' && item.error && (
                            <div style={{ color: '#ef4444', fontSize: '10px', marginTop: '2px', fontWeight: 500 }}>
                              Error: {item.error}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {ledger.length === 0 && (
                      <tr>
                        <td colSpan={5} className="ledger-no-data">
                          No background writes have been triggered in this session yet. Try editing cells or adding rows.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
