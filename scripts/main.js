// Auto-created main entry to complete core structure
$(function(){
  try {
    var hasApp = !!window.App;
    var hasInit = hasApp && typeof window.App.init === 'function';
    var hasRender = hasApp && typeof window.App.render === 'function';
    if (!hasApp || !hasInit || !hasRender) {
      var details = {
        hasApp: hasApp,
        hasInit: hasInit,
        hasRender: hasRender,
        availableKeys: hasApp ? Object.keys(window.App || {}) : [],
        hint: 'Define in scripts/ui.js: window.App = window.App || {}; App.init = function(){}; App.render = function(){};'
      };
      console.error('[Contract] Missing App.init/App.render', details);
      return;
    }

    App.init();
    App.render();

    var $progress = $('#progress');
    var $previewImage = $('#previewImage');
    var $previewEmpty = $('#previewEmpty');
    var $swatchGrid = $('#swatchGrid');
    var $activePalette = $('#activePalette');

    function setProgress(msg){ $progress.text(msg || ''); }

    function showPreview(img){
      if(!img || !img.src) return;
      $previewImage.attr('src', img.src).css('display', 'block');
      $previewEmpty.hide();
    }

    // File input change -> preview
    $('#imageInput').on('change', function(){
      var file = this.files && this.files[0];
      if(!file) return;
      setProgress('Loading image...');
      App.Utils.loadImageFromFile(file).then(function(img){
        showPreview(img);
        setProgress('');
      }).catch(function(err){
        console.error(err);
        setProgress('Failed to load image');
      });
    });
    // Make the "Choose file" button open the hidden file input so users can pick an image
    $('#chooseFile').on('click', function(e){
      e.preventDefault();
      // forward activation to the actual file input element
      var $input = $('#imageInput');
      if($input && $input.length){
        $input.trigger('click');
      } else {
        setProgress('File input not available');
      }
    });

    // Load from URL button
    $('#loadUrl').on('click', function(e){
      e.preventDefault();
      var url = ($('#imageUrl').val() || '').trim();
      if(!url){ setProgress('Enter an image URL'); return; }
      setProgress('Loading image from URL...');
      App.Utils.loadImageFromUrl(url).then(function(img){
        showPreview(img);
        setProgress('');
      }).catch(function(err){
        console.error(err);
        setProgress('Failed to load image from URL');
      });
    });

    // Use a small inline sample image (SVG data URI) for quick testing
    $('#useSample').on('click', function(e){
      e.preventDefault();
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="100%" height="100%" fill="#F3F4F6"/><circle cx="220" cy="200" r="120" fill="#7C3AED"/><circle cx="460" cy="200" r="120" fill="#059669"/><rect x="560" y="110" width="160" height="160" fill="#EF4444" rx="24"/></svg>';
      var url = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
      setProgress('Loading sample image...');
      App.Utils.loadImageFromUrl(url).then(function(img){
        showPreview(img);
        setProgress('');
      }).catch(function(err){
        console.error(err);
        setProgress('Failed to load sample image');
      });
    });

    // Helper to obtain an image for extraction: prefer file input, then URL, then preview
    function getImageForExtraction(){
      var input = document.getElementById('imageInput');
      if(input && input.files && input.files[0]) return App.Utils.loadImageFromFile(input.files[0]);
      var url = ($('#imageUrl').val() || '').trim();
      if(url) return App.Utils.loadImageFromUrl(url);
      var src = $previewImage.attr('src');
      if(src) {
        return new Promise(function(resolve,reject){
          var img = new Image();
          img.crossOrigin = 'Anonymous';
          img.onload = function(){ resolve(img); };
          img.onerror = function(){ reject(new Error('Preview image load error')); };
          img.src = src;
        });
      }
      return Promise.reject(new Error('No image source available'));
    }

    function renderSwatches(colors){
      $swatchGrid.empty();
      (colors || []).forEach(function(hex){
        var $b = $('<button type="button" class="swatch" title="'+hex+'" aria-label="Color '+hex+'"></button>');
        $b.css({ 'background-color': hex });
        $b.attr('data-hex', hex);
        $swatchGrid.append($b);
      });
    }

    function addToActive(hex){
      if(!hex) return;
      if($activePalette.find('[data-hex="'+hex+'"]').length) return; // no dupes
      if($activePalette.children().length >= 8){ setProgress('Max 8 colors in active palette'); return; }
      var $chip = $('<button type="button" class="chip" data-hex="'+hex+'" title="Remove '+hex+'">'+hex+'</button>');
      // style contrast: chip text uses default styles; include a small color square visually (keeps minimal changes)
      $chip.on('click', function(){ $(this).remove(); setProgress(''); });
      $activePalette.append($chip);
    }

    // Delegate swatch clicks
    $swatchGrid.on('click', '.swatch', function(){
      var hex = $(this).attr('data-hex');
      addToActive(hex);
    });

    // Extract button behavior
    $('#extractBtn').on('click', function(e){
      e.preventDefault();
      var $btn = $(this);
      $btn.prop('disabled', true).addClass('opacity-60 cursor-not-allowed');
      setProgress('Extracting colors...');
      var count = parseInt($('#numColors').val(), 10) || 6;
      getImageForExtraction().then(function(img){
        // use a reasonable sampling step (lower = more accurate / slower)
        return App.Utils.extractColors(img, count, 6);
      }).then(function(colors){
        renderSwatches(colors || []);
        setProgress((colors && colors.length) ? ('Found '+colors.length+' colors') : 'No colors found');
      }).catch(function(err){
        console.error(err);
        setProgress('Could not extract colors: '+(err && err.message ? err.message : err));
      }).finally(function(){
        $btn.prop('disabled', false).removeClass('opacity-60 cursor-not-allowed');
      });
    });

    // Copy active palette JSON
    $('#copyPalette').on('click', function(){
      var colors = [];
      $activePalette.find('[data-hex]').each(function(){ colors.push($(this).attr('data-hex')); });
      if(!colors.length){ setProgress('Active palette is empty'); return; }
      var json = JSON.stringify(colors, null, 2);
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(json).then(function(){ setProgress('Palette JSON copied to clipboard'); }).catch(function(){ fallbackCopy(json); });
      } else { fallbackCopy(json); }
      function fallbackCopy(txt){
        var ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); setProgress('Palette JSON copied to clipboard'); } catch(e){ setProgress('Copy failed'); }
        ta.remove();
      }
    });

    // Clear swatches
    $('#clearSwatches').on('click', function(){ $swatchGrid.empty(); setProgress('Swatches cleared'); });

    // Quick save active palette
    $('#quickSave').on('click', function(){
      var name = ($('#paletteName').val() || '').trim() || 'Untitled';
      var colors = [];
      $activePalette.find('[data-hex]').each(function(){ colors.push($(this).attr('data-hex')); });
      if(!colors.length){ setProgress('No colors to save'); return; }
      var palette = { name: name, colors: colors, created: Date.now() };
      window.App.Storage.addPalette(palette);
      setProgress('Palette saved');
      renderSavedList();
    });

    // Render saved palettes list
    function renderSavedList(){
      var list = window.App.Storage.loadPalettes();
      var $list = $('#savedList').empty();
      list.forEach(function(p, idx){
        var $row = $('<div class="palette-row"></div>');
        var $preview = $('<div class="palette-preview"></div>');
        (p.colors || []).forEach(function(c){
          var $sq = $('<div></div>').css({ width: '28px', height: '28px', 'border-radius': '4px', 'background-color': c, border: '1px solid rgba(0,0,0,0.04)' });
          $preview.append($sq);
        });
        var $meta = $('<div class="text-sm">'+(p.name || 'Palette')+'</div>');
        var $del = $('<button class="btn-ghost">Delete</button>');
        $del.on('click', function(){ window.App.Storage.deletePaletteAt(idx); renderSavedList(); });
        $row.append($preview).append($meta).append($del);
        $list.append($row);
      });
    }

    renderSavedList();

  } catch (e) {
    console.error('Initialization failed', e);
  }
});
