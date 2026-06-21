// Cloudinary REST upload module (Firebase Storage imports removed)

export interface CompressionConfig {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  autoQualityScale: boolean;
  convertToFormat: 'jpeg' | 'png' | 'webp';
}

export interface CompressionStats {
  originalSizeTotal: number;
  compressedSizeTotal: number;
  imagesCompressedCount: number;
}

export interface CompressionResult {
  originalSize: number;
  compressedSize: number;
  ratio: number;
  width: number;
  height: number;
  timeTakenMs: number;
  originalDataUrl: string;
  compressedDataUrl: string;
}

const DEFAULT_CONFIG: CompressionConfig = {
  maxWidth: 1600,
  maxHeight: 1600,
  quality: 0.8,
  autoQualityScale: true,
  convertToFormat: 'jpeg'
};

const DEFAULT_STATS: CompressionStats = {
  originalSizeTotal: 0,
  compressedSizeTotal: 0,
  imagesCompressedCount: 0
};

export class ImageCompressionModule {
  private static CONFIG_KEY = 'rb_compression_config';
  private static STATS_KEY = 'rb_compression_stats';

  /**
   * Retrieves the current compression configuration from localStorage.
   */
  public static getConfig(): CompressionConfig {
    try {
      const stored = localStorage.getItem(this.CONFIG_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch (e) {
      console.error('[CompressionModule] Failed to read config from localStorage:', e);
    }
    return { ...DEFAULT_CONFIG };
  }

  /**
   * Updates and persists the compression configuration.
   */
  public static saveConfig(config: Partial<CompressionConfig>): void {
    try {
      const current = this.getConfig();
      const next = { ...current, ...config };
      localStorage.setItem(this.CONFIG_KEY, JSON.stringify(next));
      console.log('[CompressionModule] Config updated:', next);
    } catch (e) {
      console.error('[CompressionModule] Failed to save config to localStorage:', e);
    }
  }

  /**
   * Retrieves compression statistics.
   */
  public static getStats(): CompressionStats {
    try {
      const stored = localStorage.getItem(this.STATS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...DEFAULT_STATS, ...parsed };
      }
    } catch (e) {
      console.error('[CompressionModule] Failed to read stats from localStorage:', e);
    }
    return { ...DEFAULT_STATS };
  }

  /**
   * Updates cumulative compression statistics.
   */
  public static saveStats(stats: CompressionStats): void {
    try {
      localStorage.setItem(this.STATS_KEY, JSON.stringify(stats));
    } catch (e) {
      console.error('[CompressionModule] Failed to save stats to localStorage:', e);
    }
  }

  /**
   * Resets all compression metrics.
   */
  public static resetStats(): void {
    try {
      localStorage.setItem(this.STATS_KEY, JSON.stringify(DEFAULT_STATS));
    } catch (e) {
      console.error('[CompressionModule] Failed to reset stats:', e);
    }
  }

  /**
   * Compresses an image file according to the config. Returns a compressed base64 string.
   */
  public static compressImage(file: File, configOverride?: Partial<CompressionConfig>): Promise<string> {
    return new Promise((resolve, reject) => {
      const startTime = performance.now();
      if (!file.type.startsWith('image/')) {
        reject(new Error('File is not an image'));
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        if (!e.target?.result) {
          reject(new Error("Failed to read file as data URL"));
          return;
        }
        const dataUrl = e.target.result as string;
        const img = new Image();
        img.onload = () => {
          try {
            const originalPixels = img.width * img.height;
            
            // Bypass compression if file size is <= 100KB AND resolution is <= 1MP (1,000,000 pixels)
            if (file.size <= 100000 && originalPixels <= 1000000) {
              console.log(`[CompressionModule] Bypassing canvas compression. Size: ${(file.size / 1024).toFixed(1)} KB, Resolution: ${(originalPixels / 1000000).toFixed(2)} MP. Converted directly to base64.`);
              
              // Record stats
              try {
                const approxBytes = Math.round((dataUrl.length - 22) * 3 / 4);
                const stats = this.getStats();
                stats.originalSizeTotal += file.size;
                stats.compressedSizeTotal += approxBytes;
                stats.imagesCompressedCount += 1;
                this.saveStats(stats);
              } catch (statErr) {
                console.warn('[CompressionModule] Could not update stats:', statErr);
              }
              
              resolve(dataUrl);
              return;
            }

            const config = { ...this.getConfig(), ...configOverride };
            let finalQuality = config.quality;

            // Intelligent auto-scaling quality based on raw file sizes
            if (config.autoQualityScale) {
              if (file.size < 50 * 1024) {
                finalQuality = Math.min(0.85, config.quality * 1.5); // High quality for thumbnails
              } else if (file.size > 5 * 1024 * 1024) {
                finalQuality = Math.max(0.25, config.quality * 0.5); // Aggressive quality reduction for 5MB+ raw files
              } else if (file.size > 2 * 1024 * 1024) {
                finalQuality = Math.max(0.35, config.quality * 0.7); // Dynamic quality reduction for 2MB+
              }
            }

            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // 1. Enforce 1 MP limit if it is above 1 MP
            if (originalPixels > 1000000) {
              const scale = Math.sqrt(1000000 / originalPixels);
              width = Math.floor(width * scale);
              height = Math.floor(height * scale);
              console.log(`[CompressionModule] Image is above 1 MP (${(originalPixels / 1000000).toFixed(2)} MP). Resizing to ${(width * height / 1000000).toFixed(2)} MP (${width}x${height})`);
            }

            // 2. Aspect ratio bounding calculation (further downscale to fit config limits if needed)
            if (width > height) {
              if (width > config.maxWidth) {
                height = Math.round((height * config.maxWidth) / width);
                width = config.maxWidth;
              }
            } else {
              if (height > config.maxHeight) {
                width = Math.round((width * config.maxHeight) / height);
                height = config.maxHeight;
              }
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
              // Context failed, resolve with raw data url
              resolve(dataUrl);
              return;
            }

            ctx.drawImage(img, 0, 0, width, height);

            const formatMime = `image/${config.convertToFormat}`;
            let compressedBase64 = canvas.toDataURL(formatMime, finalQuality);

            // Iterative safety downscaling loop: strictly reduce image until base64 length is under 1,000,000 characters (< 750KB binary)
            let iteration = 0;
            const maxIterations = 4;
            let currentWidth = width;
            let currentHeight = height;

            while (compressedBase64.length > 1000000 && iteration < maxIterations) {
              iteration++;
              currentWidth = Math.round(currentWidth * 0.8);
              currentHeight = Math.round(currentHeight * 0.8);
              finalQuality = Math.max(0.15, finalQuality * 0.75);

              console.log(`[CompressionModule] Base64 length ${compressedBase64.length} exceeds 1MB limit. Downscaling iteration ${iteration}: ${currentWidth}x${currentHeight} at quality ${finalQuality}`);

              const scaleCanvas = document.createElement('canvas');
              scaleCanvas.width = currentWidth;
              scaleCanvas.height = currentHeight;
              const scaleCtx = scaleCanvas.getContext('2d');
              if (scaleCtx) {
                scaleCtx.drawImage(img, 0, 0, currentWidth, currentHeight);
                compressedBase64 = scaleCanvas.toDataURL(formatMime, finalQuality);
              }
            }

            // Record cumulative savings statistics asynchronously
            try {
              const approxBytes = Math.round((compressedBase64.length - 22) * 3 / 4); // base64 length to bytes approx
              const stats = this.getStats();
              stats.originalSizeTotal += file.size;
              stats.compressedSizeTotal += approxBytes;
              stats.imagesCompressedCount += 1;
              this.saveStats(stats);
            } catch (statErr) {
              console.warn('[CompressionModule] Could not update stats:', statErr);
            }

            const endTime = performance.now();
            console.log(
              `[CompressionModule] Successfully compressed image inside ${Math.round(endTime - startTime)}ms. ` +
              `Size: ${Math.round(file.size / 1024)}KB -> ${Math.round(compressedBase64.length * 3 / 4 / 1024)}KB.`
            );

            resolve(compressedBase64);
          } catch (canvasErr: any) {
            reject(new Error(`Canvas manipulation failed: ${canvasErr?.message || canvasErr}`));
          }
        };

        img.onerror = () => {
          reject(new Error('Image failed to render inside Canvas'));
        };
        img.src = dataUrl;
      };

      reader.onerror = () => {
        reject(new Error('Failed to read image file buffer'));
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Runs a test compression inside the sandbox and returns a diagnostic result.
   * Does NOT alter global stats.
   */
  public static testCompress(file: File, configOverride?: Partial<CompressionConfig>): Promise<CompressionResult> {
    return new Promise((resolve, reject) => {
      const startTime = performance.now();
      if (!file.type.startsWith('image/')) {
        reject(new Error('File is not an image'));
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        if (!e.target?.result) {
          reject(new Error("Failed to read file as data URL"));
          return;
        }
        const dataUrl = e.target.result as string;
        const img = new Image();
        img.onload = () => {
          try {
            const originalPixels = img.width * img.height;
            const endTime = performance.now();
            
            // Bypass compression if file size is <= 100KB AND resolution is <= 1MP (1,000,000 pixels)
            if (file.size <= 100000 && originalPixels <= 1000000) {
              const approxBytes = Math.round((dataUrl.length - 22) * 3 / 4);
              resolve({
                originalSize: file.size,
                compressedSize: approxBytes,
                ratio: 0.0,
                width: img.width,
                height: img.height,
                timeTakenMs: Math.round(endTime - startTime),
                originalDataUrl: dataUrl,
                compressedDataUrl: dataUrl
              });
              return;
            }

            const config = { ...this.getConfig(), ...configOverride };
            let finalQuality = config.quality;

            if (config.autoQualityScale) {
              if (file.size < 50 * 1024) {
                finalQuality = Math.min(0.85, config.quality * 1.5);
              } else if (file.size > 5 * 1024 * 1024) {
                finalQuality = Math.max(0.25, config.quality * 0.5);
              } else if (file.size > 2 * 1024 * 1024) {
                finalQuality = Math.max(0.35, config.quality * 0.7);
              }
            }

            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // 1. Enforce 1 MP limit if it is above 1 MP
            if (originalPixels > 1000000) {
              const scale = Math.sqrt(1000000 / originalPixels);
              width = Math.floor(width * scale);
              height = Math.floor(height * scale);
            }

            // 2. Aspect ratio bounding calculation (further downscale to fit config limits if needed)
            if (width > height) {
              if (width > config.maxWidth) {
                height = Math.round((height * config.maxWidth) / width);
                width = config.maxWidth;
              }
            } else {
              if (height > config.maxHeight) {
                width = Math.round((width * config.maxHeight) / height);
                height = config.maxHeight;
              }
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error('Canvas context could not be acquired'));
              return;
            }

            ctx.drawImage(img, 0, 0, width, height);
            const formatMime = `image/${config.convertToFormat}`;
            let compressedDataUrl = canvas.toDataURL(formatMime, finalQuality);

            // Iterative safety downscaling loop: strictly reduce image until base64 length is under 1,000,000 characters (< 750KB binary)
            let iteration = 0;
            const maxIterations = 4;
            let currentWidth = width;
            let currentHeight = height;

            while (compressedDataUrl.length > 1000000 && iteration < maxIterations) {
              iteration++;
              currentWidth = Math.round(currentWidth * 0.8);
              currentHeight = Math.round(currentHeight * 0.8);
              finalQuality = Math.max(0.15, finalQuality * 0.75);

              const scaleCanvas = document.createElement('canvas');
              scaleCanvas.width = currentWidth;
              scaleCanvas.height = currentHeight;
              const scaleCtx = scaleCanvas.getContext('2d');
              if (scaleCtx) {
                scaleCtx.drawImage(img, 0, 0, currentWidth, currentHeight);
                compressedDataUrl = scaleCanvas.toDataURL(formatMime, finalQuality);
              }
            }

            const compressionEndTime = performance.now();
            const approxBytes = Math.round((compressedDataUrl.length - 22) * 3 / 4);

            resolve({
              originalSize: file.size,
              compressedSize: approxBytes,
              ratio: Math.max(0, parseFloat((((file.size - approxBytes) / file.size) * 100).toFixed(1))),
              width: currentWidth,
              height: currentHeight,
              timeTakenMs: Math.round(compressionEndTime - startTime),
              originalDataUrl: dataUrl,
              compressedDataUrl
            });
          } catch (canvasErr: any) {
            reject(new Error(`Canvas manipulation failed: ${canvasErr?.message || canvasErr}`));
          }
        };
        img.onerror = () => {
          reject(new Error('Image failed to render inside Canvas'));
        };
        img.src = dataUrl;
      };
      reader.onerror = () => {
        reject(new Error('Failed to read image file buffer'));
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Compresses an existing base64 image string to a smaller size using HTML5 Canvas.
   */
  public static compressBase64(
    base64: string,
    maxWidth = 400,
    maxHeight = 400,
    quality = 0.25
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!base64 || base64.trim() === '') {
        resolve('');
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(base64); // fallback if context fails
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', quality);
          resolve(compressed);
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => {
        reject(new Error("Failed to load base64 image onto Image element"));
      };
      img.src = base64;
    });
  }

  /**
   * Pure-JS SHA-1 fallback for environments where crypto.subtle is unavailable (HTTP / non-secure context).
   */
  private static sha1Pure(str: string): string {
    function rotl(n: number, s: number) { return (n << s) | (n >>> (32 - s)); }
    const utf8 = new TextEncoder().encode(str);
    const msgLen = utf8.length;
    // Pre-processing: pad message
    const byteLen = ((msgLen + 9 + 63) & ~63); // multiple of 64
    const buf = new Uint8Array(byteLen);
    buf.set(utf8);
    buf[msgLen] = 0x80;
    const view = new DataView(buf.buffer);
    // Append length in bits as big-endian 64-bit
    const bitLen = msgLen * 8;
    view.setUint32(byteLen - 4, bitLen, false);

    let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;
    const w = new Int32Array(80);
    for (let offset = 0; offset < byteLen; offset += 64) {
      for (let i = 0; i < 16; i++) w[i] = view.getInt32(offset + i * 4, false);
      for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
      let a = h0, b = h1, c = h2, d = h3, e = h4;
      for (let i = 0; i < 80; i++) {
        let f: number, k: number;
        if (i < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
        else if (i < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
        else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
        else { f = b ^ c ^ d; k = 0xCA62C1D6; }
        const temp = (rotl(a, 5) + f + e + k + w[i]) | 0;
        e = d; d = c; c = rotl(b, 30); b = a; a = temp;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
    }
    return [h0, h1, h2, h3, h4].map(v => (v >>> 0).toString(16).padStart(8, '0')).join('');
  }

  /**
   * SHA-1 hash using Web Crypto API (preferred) with pure-JS fallback.
   */
  private static async sha1(str: string): Promise<string> {
    // crypto.subtle is only available in secure contexts (HTTPS / localhost on some browsers)
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      try {
        const utf8 = new TextEncoder().encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-1', utf8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      } catch (e) {
        console.warn('[SHA-1] crypto.subtle.digest failed, using pure-JS fallback:', e);
      }
    }
    console.log('[SHA-1] Using pure-JS SHA-1 implementation (crypto.subtle unavailable)');
    return this.sha1Pure(str);
  }

  /**
   * Compresses an image file and uploads it directly to Cloudinary using a secure signed upload.
   * Returns the Cloudinary HTTPS URL on success, or falls back to compressed base64 on failure.
   */
  public static async compressAndUploadToCloudinary(file: File): Promise<string> {
    // 1. Compress image to Base64 first using existing high-quality module
    const compressedBase64 = await this.compressImage(file);
    
    try {
      const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'dorxms8wu';
      const apiKey = import.meta.env.VITE_CLOUDINARY_API_KEY || '124594964523531';
      const apiSecret = import.meta.env.VITE_CLOUDINARY_API_SECRET || 'OzCir1bp4le0fcyjj3a1IM0hbO0';
      
      const timestamp = Math.round(new Date().getTime() / 1000).toString();
      const folder = 'record_book_images';
      
      // Calculate signature: alphabetically sorted parameters + secret appended
      const signatureString = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
      console.log(`[Cloudinary Upload] Generating SHA-1 signature...`);
      const signature = await this.sha1(signatureString);
      console.log(`[Cloudinary Upload] Signature generated: ${signature.substring(0, 10)}...`);
      
      const formData = new FormData();
      formData.append('file', compressedBase64);
      formData.append('api_key', apiKey);
      formData.append('timestamp', timestamp);
      formData.append('signature', signature);
      formData.append('folder', folder);
      
      console.log(`[Cloudinary Upload] Starting upload to https://api.cloudinary.com/v1_1/${cloudName}/image/upload ...`);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body: formData
      });
      
      if (!res.ok) {
        const errText = await res.text();
        console.error(`[Cloudinary Upload] HTTP ${res.status} Error:`, errText);
        throw new Error(`Cloudinary responded with status ${res.status}: ${errText}`);
      }
      
      const data = await res.json();
      if (!data.secure_url) {
        console.error('[Cloudinary Upload] Response missing secure_url:', data);
        throw new Error('No secure_url returned from Cloudinary response');
      }
      
      console.log(`[Cloudinary Upload] ✅ Upload successful! URL:`, data.secure_url);
      return data.secure_url;
    } catch (error: any) {
      console.error('[Cloudinary Upload] ❌ FAILED:', error?.message || error);
      console.warn('[Cloudinary Upload] Falling back to local Base64 storage. Image will show as "Local Photo" in exports.');
      // Fallback to storing the compressed base64 directly
      return compressedBase64;
    }
  }

  /**
   * Compresses an image and attempts to upload it directly to Cloudinary.
   * If the upload fails, it automatically falls back to returning the compressed Base64 string.
   */
  public static async compressAndUploadImage(
    file: File,
    registerId: number | string,
    entryId: number | string,
    columnId: string
  ): Promise<string> {
    return this.compressAndUploadToCloudinary(file);
  }
}

