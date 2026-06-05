/**
 * Mobile Download Utility
 * 
 * Detects if running inside Capacitor (native mobile) and uses
 * Filesystem + Share APIs to save & share files instead of
 * browser blob-download which doesn't work in WebView.
 */
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/** Check if running inside a native Capacitor shell */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Save a file on mobile via Capacitor Filesystem + Share dialog.
 * Falls back to browser download on web.
 */
export async function mobileDownloadFile(
  data: Blob | ArrayBuffer | Uint8Array,
  filename: string,
  mimeType: string
): Promise<void> {
  if (!isNativePlatform()) {
    // Web browser fallback — standard blob download
    const blob = data instanceof Blob ? data : new Blob([data as any], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }

  // ── Native (Capacitor) path ──
  try {
    // Convert data to base64
    let base64Data: string;

    if (data instanceof Blob) {
      base64Data = await blobToBase64(data);
    } else if (data instanceof ArrayBuffer) {
      base64Data = arrayBufferToBase64(data);
    } else {
      // Uint8Array
      base64Data = uint8ArrayToBase64(data);
    }

    // Write to Downloads directory (or Documents as fallback)
    const result = await Filesystem.writeFile({
      path: filename,
      data: base64Data,
      directory: Directory.Cache,
      recursive: true,
    });

    // Share the file so user can open with their preferred app or save
    await Share.share({
      title: filename,
      url: result.uri,
      dialogTitle: `Save ${filename}`,
    });

  } catch (err) {
    console.error('Mobile download error:', err);
    // Ultimate fallback: try browser download anyway
    const blob = data instanceof Blob ? data : new Blob([data as any], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

/** Convert Blob to base64 string (without the data:... prefix) */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Strip "data:...;base64," prefix
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Convert ArrayBuffer to base64 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return uint8ArrayToBase64(bytes);
}

/** Convert Uint8Array to base64 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunkSize) as unknown as number[]
    );
  }
  return btoa(binary);
}

