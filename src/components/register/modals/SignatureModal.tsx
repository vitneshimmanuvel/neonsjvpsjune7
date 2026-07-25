import React, { useRef, useState, useEffect, useCallback } from 'react';
import { PenTool, RotateCcw, Check, X, Eraser, Download } from 'lucide-react';

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (signatureDataUrl: string) => void;
  initialSignature?: string;
  columnName?: string;
}

const INK_COLORS = [
  { name: 'Classic Blue', hex: '#1d4ed8' },
  { name: 'Dark Navy', hex: '#1e3a8a' },
  { name: 'Black', hex: '#0f172a' },
  { name: 'Dark Emerald', hex: '#047857' },
];

const PEN_SIZES = [
  { name: 'Fine', value: 2 },
  { name: 'Medium', value: 3 },
  { name: 'Thick', value: 5 },
];

export function SignatureModal({
  isOpen,
  onClose,
  onSave,
  initialSignature = '',
  columnName = 'Signature',
}: SignatureModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [penColor, setPenColor] = useState('#1d4ed8');
  const [penSize, setPenSize] = useState(3);
  const [isCanvasLoaded, setIsCanvasLoaded] = useState(false);

  // Initialize canvas
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penSize;

    // Fill white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Draw baseline guide
    drawGuideLine(ctx, rect.width, rect.height);

    // Load initial signature if available
    if (initialSignature) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
        setHasDrawn(true);
      };
      img.src = initialSignature;
    } else {
      setHasDrawn(false);
    }

    setIsCanvasLoaded(true);
  }, [initialSignature]);

  // Draw signature baseline guide
  const drawGuideLine = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    const y = height * 0.75;
    ctx.moveTo(30, y);
    ctx.lineTo(width - 30, y);
    ctx.stroke();

    // Baseline label
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Sign above line', width - 35, y - 6);
    ctx.restore();
  };

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => initCanvas(), 50);
    }
  }, [isOpen, initCanvas]);

  // Update stroke style when color or size changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.strokeStyle = penColor;
      ctx.lineWidth = penSize;
    }
  }, [penColor, penSize]);

  // Calculate mouse/touch position
  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penSize;
    setIsDrawing(true);
    setHasDrawn(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.closePath();
    setIsDrawing(false);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    drawGuideLine(ctx, rect.width, rect.height);
    setHasDrawn(false);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!hasDrawn) {
      onSave('');
      onClose();
      return;
    }

    // Convert canvas to Data URL
    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 10006 }}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '540px', maxWidth: '95vw', padding: '24px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 className="modal-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
            <PenTool size={18} style={{ color: 'var(--primary)' }} />
            Digital Signature — {columnName}
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '4px' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Ink & Pen Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          {/* Color Selection */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Ink:</span>
            {INK_COLORS.map((c) => (
              <button
                key={c.hex}
                type="button"
                onClick={() => setPenColor(c.hex)}
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: c.hex,
                  border: penColor === c.hex ? '2px solid var(--navy)' : '2px solid transparent',
                  boxShadow: penColor === c.hex ? '0 0 0 2px rgba(30, 58, 138, 0.3)' : 'none',
                  cursor: 'pointer',
                  transition: 'transform 0.15s',
                  transform: penColor === c.hex ? 'scale(1.15)' : 'scale(1)',
                }}
                title={c.name}
              />
            ))}
          </div>

          {/* Pen Size Selection */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Thickness:</span>
            {PEN_SIZES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setPenSize(s.value)}
                style={{
                  padding: '3px 8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: penSize === s.value ? 'var(--navy)' : 'white',
                  color: penSize === s.value ? 'white' : 'var(--text-main)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {/* Canvas Pad */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '240px',
            border: '2px dashed var(--border)',
            borderRadius: '12px',
            backgroundColor: '#ffffff',
            overflow: 'hidden',
            boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.02)',
            touchAction: 'none',
          }}
        >
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '100%', cursor: 'crosshair', display: 'block' }}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
        </div>

        {/* Actions Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
          <button
            type="button"
            onClick={handleClear}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'white',
              color: 'var(--danger)',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <RotateCcw size={14} /> Clear Board
          </button>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="modal-cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="modal-confirm-btn"
              onClick={handleSave}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
              }}
            >
              <Check size={16} /> Save Signature
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
