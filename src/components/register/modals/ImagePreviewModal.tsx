import React, { useState } from 'react';
import { ChevronDown, Download, Plus, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { ImageCompressionModule } from '../../../lib/imageCompressionModule';

interface ImagePreviewModalProps {
  previewImage: { url: string; entryId?: number; colId?: string };
  setPreviewImage: (val: any) => void;
  handleImageDownload: (url: string) => void;
  uploadingCells: Record<string, boolean>;
  setUploadingCells: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setUploadingImagesCount: React.Dispatch<React.SetStateAction<number>>;
  registerId: number;
  handleCellChange: (entryId: number, colId: string, val: string) => void | boolean | Promise<any>;
  detailViewEntry: any;
  setDetailEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

export function ImagePreviewModal({
  previewImage,
  setPreviewImage,
  handleImageDownload,
  uploadingCells,
  setUploadingCells,
  setUploadingImagesCount,
  registerId,
  handleCellChange,
  detailViewEntry,
  setDetailEdits
}: ImagePreviewModalProps) {
  const [previewImageIndex, setPreviewImageIndex] = useState(0);
  const [isImgZoomed, setIsImgZoomed] = useState(false);

  const urls = previewImage.url.includes('|||') ? previewImage.url.split('|||') : [previewImage.url];
  const currentUrl = urls[previewImageIndex] || urls[0];

  return (
    <div className="img-preview-overlay" onClick={() => { setPreviewImage(null); setIsImgZoomed(false); setPreviewImageIndex(0); }}>
      <div className="img-preview-content" onClick={e => e.stopPropagation()}>
        <div className="img-preview-header">
          <h3>Image Preview {urls.length > 1 ? `(${previewImageIndex + 1}/${urls.length})` : ''}</h3>
          <div className="img-preview-actions">
            {/* Previous Image */}
            {urls.length > 1 && (
              <button 
                className="img-preview-nav"
                disabled={previewImageIndex === 0}
                onClick={() => setPreviewImageIndex(prev => prev - 1)}
              >
                <ChevronDown size={20} style={{ transform: 'rotate(90deg)' }} />
              </button>
            )}
            {/* Next Image */}
            {urls.length > 1 && (
              <button 
                className="img-preview-nav"
                disabled={previewImageIndex === urls.length - 1}
                onClick={() => setPreviewImageIndex(prev => prev + 1)}
              >
                <ChevronDown size={20} style={{ transform: 'rotate(-90deg)' }} />
              </button>
            )}
            
            <div className="img-preview-divider" />

            <button onClick={() => handleImageDownload(currentUrl)} className="img-download-btn" title="Download Image">
              <Download size={18} />
              Download
            </button>

            {previewImage.entryId !== undefined && previewImage.colId !== undefined && (
              <>
                {uploadingCells[previewImage.colId!] ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'white', opacity: 0.8, padding: '8px 12px' }}>
                    <div className="spinner" style={{ width: '12px', height: '12px', border: '2px solid rgba(255,255,255,0.2)', borderLeftColor: 'white' }} />
                    <span style={{ fontSize: '13px' }}>Uploading...</span>
                  </div>
                ) : (
                  <label className="img-preview-add" title="Add Image">
                    <input 
                      type="file" 
                      accept="image/*" 
                      style={{ display: 'none' }} 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          console.log(`[Preview View - Image Selected] Selected file for row #${previewImage.entryId}, column #${previewImage.colId}:`, file.name, `${(file.size / 1024).toFixed(1)} KB`);
                          setUploadingCells(prev => ({ ...prev, [previewImage.colId!]: true }));
                          setUploadingImagesCount(prev => prev + 1);
                          console.log(`[Preview View - Image Upload] Starting compression & upload...`);
                          ImageCompressionModule.compressAndUploadImage(file, registerId, previewImage.entryId!, previewImage.colId!)
                            .then(async (newUrl) => {
                              console.log(`[Preview View - Image Upload] Upload / Compression succeeded. Persisting to database...`);
                              const updated = [...urls, newUrl].join('|||');
                              const res = handleCellChange(previewImage.entryId!, previewImage.colId!, updated);
                              if (res === false) throw new Error("Cell change rejected");
                              await res;
                              setPreviewImage({ ...previewImage, url: updated });
                              setPreviewImageIndex(urls.length);
                            })
                            .then(() => {
                              console.log(`[Preview View - Image Upload] PERSISTED successfully to database for row #${previewImage.entryId}, column #${previewImage.colId}!`);
                            })
                            .catch(err => {
                              console.error(`[Preview View - Image Upload] FAILED for row #${previewImage.entryId}, column #${previewImage.colId}:`, err);
                            })
                            .finally(() => {
                              setUploadingCells(prev => ({ ...prev, [previewImage.colId!]: false }));
                              setUploadingImagesCount(prev => Math.max(0, prev - 1));
                            });
                        }
                      }}
                    />
                    <Plus size={18} /> Add Image
                  </label>
                )}
                <button 
                  className="img-preview-remove" 
                  onClick={() => {
                    if (urls.length > 1) {
                      const next = [...urls];
                      next.splice(previewImageIndex, 1);
                      const updated = next.join('|||');
                      handleCellChange(previewImage.entryId!, previewImage.colId!, updated);
                      setPreviewImage({ ...previewImage, url: updated });
                      setPreviewImageIndex(Math.max(0, previewImageIndex - 1));
                    } else {
                      handleCellChange(previewImage.entryId!, previewImage.colId!, '');
                      if (detailViewEntry?.id === previewImage.entryId) {
                        setDetailEdits(prev => ({ ...prev, [previewImage.colId!]: '' }));
                      }
                      setPreviewImage(null);
                      setIsImgZoomed(false);
                    }
                  }}
                  title="Remove Current Image"
                >
                  <Trash2 size={18} /> Remove
                </button>
              </>
            )}
            <button className="img-preview-btn" onClick={() => setIsImgZoomed(!isImgZoomed)} title={isImgZoomed ? "Zoom Out" : "Zoom In"}>
              {isImgZoomed ? <ZoomOut size={20} /> : <ZoomIn size={20} />}
            </button>
            <button className="img-preview-close" onClick={() => { setPreviewImage(null); setIsImgZoomed(false); setPreviewImageIndex(0); }}>✕</button>
          </div>
        </div>
        <div className="img-preview-body" onClick={() => setIsImgZoomed(!isImgZoomed)}>
          <img src={currentUrl} alt="Large preview" className={isImgZoomed ? 'zoomed' : ''} />
        </div>
      </div>
    </div>
  );
}
