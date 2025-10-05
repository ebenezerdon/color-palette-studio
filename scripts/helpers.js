/* scripts/helpers.js
   Utilities and storage helpers for Color Palette Studio.
   Uses window.App namespace conventions.
*/

(function(){
  'use strict';

  window.App = window.App || {};
  window.App.Utils = window.App.Utils || {};
  window.App.Storage = window.App.Storage || {};

  // Local storage key
  const STORAGE_KEY = 'color-palette-studio.v1.palettes';

  // Helpers: color conversions
  window.App.Utils.rgbToHex = function(r,g,b){
    const toHex = (n) => ('0' + Math.max(0, Math.min(255, Math.round(n))).toString(16)).slice(-2);
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  };

  window.App.Utils.hexToRgb = function(hex){
    if(!hex) return null;
    const cleaned = hex.replace('#','');
    if(cleaned.length === 3){
      return {
        r: parseInt(cleaned[0]+cleaned[0],16),
        g: parseInt(cleaned[1]+cleaned[1],16),
        b: parseInt(cleaned[2]+cleaned[2],16)
      };
    }
    if(cleaned.length === 6){
      return {
        r: parseInt(cleaned.slice(0,2),16),
        g: parseInt(cleaned.slice(2,4),16),
        b: parseInt(cleaned.slice(4,6),16)
      };
    }
    return null;
  };

  // Relative luminance per WCAG
  window.App.Utils.relativeLuminance = function(rgb){
    // rgb: {r,g,b}
    const sRGB = [rgb.r/255, rgb.g/255, rgb.b/255];
    const lin = sRGB.map((c) => {
      return c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4);
    });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  };

  window.App.Utils.contrastRatio = function(hexA, hexB){
    const ra = window.App.Utils.hexToRgb(hexA);
    const rb = window.App.Utils.hexToRgb(hexB);
    if(!ra || !rb) return null;
    const la = window.App.Utils.relativeLuminance(ra);
    const lb = window.App.Utils.relativeLuminance(rb);
    const lighter = Math.max(la, lb);
    const darker = Math.min(la, lb);
    const ratio = (lighter + 0.05) / (darker + 0.05);
    return Math.round(ratio * 100) / 100; // 2 decimals
  };

  // Validate hex
  window.App.Utils.isHex = function(h){
    return /^#?([0-9A-F]{3}){1,2}$/i.test(h);
  };

  // Image loader returns Promise<HTMLImageElement>
  window.App.Utils.loadImageFromFile = function(file){
    return new Promise(function(resolve,reject){
      if(!file) return reject(new Error('No file'));
      const reader = new FileReader();
      reader.onerror = function(){ reject(new Error('Failed to read file')); };
      reader.onload = function(){
        const img = new Image();
        img.onload = function(){ resolve(img); };
        img.onerror = function(){ reject(new Error('Image load error')); };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  };

  window.App.Utils.loadImageFromUrl = function(url){
    return new Promise(function(resolve,reject){
      try {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = function(){ resolve(img); };
        img.onerror = function(){ reject(new Error('Image load failed')); };
        img.src = url;
      } catch(e){
        reject(e);
      }
    });
  };

  // Color extraction: simple quantization by color bucketing
  // Parameters: image (HTMLImageElement), count (number of colors), sample (step)
  window.App.Utils.extractColors = function(image, count, sample){
    return new Promise(function(resolve){
      try{
        sample = Math.max(1, sample || 4);
        // draw to canvas
        const canvas = document.createElement('canvas');
        const maxDim = 800; // limit draw size for performance
        let w = image.naturalWidth || image.width;
        let h = image.naturalHeight || image.height;
        if(Math.max(w,h) > maxDim){
          const ratio = maxDim / Math.max(w,h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0,0,w,h);
        ctx.drawImage(image, 0, 0, w, h);
        const imgData = ctx.getImageData(0,0,w,h).data;

        const counts = Object.create(null);
        for(let y=0; y<h; y+=sample){
          for(let x=0; x<w; x+=sample){
            const idx = (y * w + x) * 4;
            const r = imgData[idx];
            const g = imgData[idx+1];
            const b = imgData[idx+2];
            const a = imgData[idx+3];
            // skip transparent pixels
            if(a < 125) continue;
            // reduce precision to bucket colors; shift to 5-bit per channel
            const key = ((r & 0xF8) << 16) | ((g & 0xF8) << 8) | (b & 0xF8);
            counts[key] = (counts[key] || 0) + 1;
          }
        }

        // convert counts to array
        const items = Object.keys(counts).map(k => ({ key: parseInt(k), count: counts[k] }));
        items.sort((a,b) => b.count - a.count);

        // build top colors
        const results = items.slice(0, Math.max(count, items.length)).map(it => {
          const k = it.key;
          const r = (k >> 16) & 0xFF;
          const g = (k >> 8) & 0xFF;
          const b = k & 0xFF;
          return window.App.Utils.rgbToHex(r,g,b);
        });

        // if we have fewer than desired, pad by sampling more broadly
        while(results.length < count){
          results.push('#EFEFEF');
        }

        resolve(results.slice(0, count));
      } catch(e){
        // graceful fallback
        resolve([]);
      }
    });
  };

  // Storage API
  window.App.Storage.savePalettes = function(palettes){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(palettes || []));
      return true;
    } catch(e){
      console.error('Storage save failed', e);
      return false;
    }
  };

  window.App.Storage.loadPalettes = function(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return [];
      const parsed = JSON.parse(raw);
      if(Array.isArray(parsed)) return parsed;
      return [];
    } catch(e){
      console.error('Storage load failed', e);
      return [];
    }
  };

  window.App.Storage.addPalette = function(palette){
    const list = window.App.Storage.loadPalettes();
    list.unshift(palette);
    // keep last 100
    const trimmed = list.slice(0,100);
    window.App.Storage.savePalettes(trimmed);
    return trimmed;
  };

  window.App.Storage.deletePaletteAt = function(index){
    const list = window.App.Storage.loadPalettes();
    if(index < 0 || index >= list.length) return list;
    list.splice(index,1);
    window.App.Storage.savePalettes(list);
    return list;
  };

  window.App.Storage.clearAll = function(){
    window.App.Storage.savePalettes([]);
  };

})();
