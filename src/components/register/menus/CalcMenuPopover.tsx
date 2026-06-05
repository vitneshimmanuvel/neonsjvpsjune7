import React from 'react';

type CalcType = 'sum' | 'average' | 'count' | 'min' | 'max' | 'filled' | 'empty' | 'distinct' | 'none';

interface CalcMenuPopoverProps {
  calcMenu: { colId: number; rect: DOMRect } | null;
  setCalcMenu: (val: { colId: number; rect: DOMRect } | null) => void;
  calcTypes: Record<number, CalcType>;
  updateCalcType: (colId: number, type: CalcType) => void;
}

export function CalcMenuPopover({
  calcMenu,
  setCalcMenu,
  calcTypes,
  updateCalcType
}: CalcMenuPopoverProps) {
  if (!calcMenu) return null;

  return (
    <div className="context-popover-layer" onClick={() => setCalcMenu(null)}>
      <div 
        className="context-menu calc-dropdown-menu"
        style={{
          position: 'fixed',
          bottom: window.innerHeight - calcMenu.rect.top + 5,
          left: Math.min(calcMenu.rect.left, window.innerWidth - 180),
          zIndex: 1000,
          width: '180px'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="context-section-label">Calculation Type</div>
        {[
          { id: 'sum', label: 'Sum (Σ)', icon: 'Σ' },
          { id: 'count', label: 'Count (N)', icon: 'N' },
          { id: 'distinct', label: 'Distinct (D)', icon: 'D' },
          { id: 'average', label: 'Average (Avg)', icon: 'μ' },
          { id: 'min', label: 'Minimum (Min)', icon: '↓' },
          { id: 'max', label: 'Maximum (Max)', icon: '↑' },
          { id: 'filled', label: 'Filled Cells', icon: '●' },
          { id: 'empty', label: 'Empty Cells', icon: '○' },
        ].map(opt => {
          const currentType = calcTypes[calcMenu.colId];
          const isActive = currentType === opt.id;
          return (
            <button 
              key={opt.id}
              className={`context-item ${isActive ? 'active' : ''}`} 
              onClick={() => updateCalcType(calcMenu.colId, opt.id as CalcType)}
            >
              <span className="context-item-icon" style={{ fontSize: '12px', width: '16px', fontWeight: 800 }}>{opt.icon}</span>
              <span className="context-item-label" style={{ fontWeight: isActive ? 700 : 400 }}>{opt.label}</span>
              {isActive && <span style={{ marginLeft: 'auto', fontSize: '10px' }}>●</span>}
            </button>
          );
        })}
        
        <div className="context-divider" />
        
        <button className="context-item danger" onClick={() => updateCalcType(calcMenu.colId, 'none')}>
          <span className="context-item-label">Remove Calculation</span>
        </button>
      </div>
    </div>
  );
}
