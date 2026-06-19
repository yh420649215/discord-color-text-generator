(function() {
  'use strict';

  var FG = [
    { ansi:'30', css:'#80848E', name:'Gray' },
    { ansi:'31', css:'#ED4245', name:'Red' },
    { ansi:'32', css:'#57F287', name:'Green' },
    { ansi:'33', css:'#FEE75C', name:'Yellow' },
    { ansi:'34', css:'#5865F2', name:'Blue' },
    { ansi:'35', css:'#EB459E', name:'Magenta' },
    { ansi:'36', css:'#00E5FF', name:'Cyan' },
    { ansi:'37', css:'#FFFFFF', name:'White' },
  ];
  var BG = [
    { ansi:'40', css:'#4F545C', name:'Gray' },
    { ansi:'41', css:'#ED4245', name:'Red' },
    { ansi:'42', css:'#57F287', name:'Green' },
    { ansi:'43', css:'#FEE75C', name:'Yellow' },
    { ansi:'44', css:'#5865F2', name:'Blue' },
    { ansi:'45', css:'#EB459E', name:'Magenta' },
    { ansi:'46', css:'#00E5FF', name:'Cyan' },
    { ansi:'47', css:'#FFFFFF', name:'White' },
  ];
  var FG_RGB = [
    { ansi:'30', r:128,g:132,b:142 },{ ansi:'31', r:237,g:66,b:69 },
    { ansi:'32', r:87,g:242,b:135 },{ ansi:'33', r:254,g:231,b:92 },
    { ansi:'34', r:88,g:101,b:242 },{ ansi:'35', r:235,g:69,b:158 },
    { ansi:'36', r:0,g:229,b:255 },{ ansi:'37', r:255,g:255,b:255 },
  ];
  var BG_RGB = [
    { ansi:'40', r:79,g:84,b:92 },  { ansi:'41', r:237,g:66,b:69 },
    { ansi:'42', r:87,g:242,b:135 },{ ansi:'43', r:254,g:231,b:92 },
    { ansi:'44', r:88,g:101,b:242 },{ ansi:'45', r:235,g:69,b:158 },
    { ansi:'46', r:0,g:229,b:255 },{ ansi:'47', r:255,g:255,b:255 },
  ];

  var editor    = document.getElementById('editor');
  var copyBtn   = document.getElementById('copyBtn');
  var toast     = document.getElementById('toast');
  var seqBlocks = document.getElementById('seqBlocks');
  var seqApply  = document.getElementById('seqApply');
  var seqClear  = document.getElementById('seqClear');
  var sequence  = [];

  // Pending styles — applied on next input to avoid re-focusing editor on mobile
  var pendingFg = null;
  var pendingBg = null;
  var pendingBold = null;       // true=apply, false=remove
  var pendingUnderline = null;  // true=apply, false=remove

  // ── iOS-compatible style helpers (fallback when execCommand is no-op) ──
  function _editorFocused() {
    return document.activeElement === editor || editor.contains(document.activeElement);
  }
  function _tryExec(cmd, val) {
    var before = editor.innerHTML;
    try { document.execCommand(cmd, false, val); } catch(e) {}
    return editor.innerHTML !== before;
  }
  function _restoreRange(range) {
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
  function _safeFocus() {
    var x = window.scrollX;
    var y = window.scrollY;
    editor.focus({ preventScroll: true });
    if (window.scrollX !== x || window.scrollY !== y) {
      window.scrollTo(x, y);
    }
  }
  // Strip inline formatting wrappers (font, span, b, u, strong, em) from a fragment,
  // preserving structural elements like <br>, <div>, <p> and text content.
  function _stripFormatting(frag) {
    var wrappers = [];
    function collect(node) {
      for (var i = 0; i < node.childNodes.length; i++) {
        collect(node.childNodes[i]);
      }
      if (node.nodeType === 1) {
        var tag = node.tagName.toLowerCase();
        if (/^(font|span|b|u|strong|em)$/.test(tag)) {
          wrappers.push(node);
        }
      }
    }
    collect(frag);
    // Unwrap leaf-first: children were pushed before parents
    for (var j = 0; j < wrappers.length; j++) {
      var el = wrappers[j];
      if (el.parentNode) {
        while (el.firstChild) {
          el.parentNode.insertBefore(el.firstChild, el);
        }
        el.parentNode.removeChild(el);
      }
    }
  }
  // Strip inline background-color styles from all elements in a fragment
  function _stripBackgrounds(frag) {
    if (!frag.querySelectorAll) return;
    var els = frag.querySelectorAll('[style]');
    for (var i = 0; i < els.length; i++) {
      els[i].style.backgroundColor = '';
    }
    // Also handle root fragment children
    for (var j = 0; j < frag.childNodes.length; j++) {
      var child = frag.childNodes[j];
      if (child.nodeType === 1 && child.style && child.style.backgroundColor) {
        child.style.backgroundColor = '';
      }
    }
  }

  function applyForeColor(css) {
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    if (!range.collapsed && range.toString().trim()) {
      _safeFocus();
      if (!_tryExec('foreColor', css)) {
        var contents = range.extractContents();
        var font = document.createElement('font');
        font.setAttribute('color', css);
        font.appendChild(contents);
        range.insertNode(font);
        range.selectNodeContents(font);
        _restoreRange(range);
      }
    } else if (_editorFocused()) {
      pendingFg = css;
    }
    updateCharCount();
  }
  function applyBackColor(css) {
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    if (!range.collapsed && range.toString().trim()) {
      _safeFocus();
      if (!_tryExec('backColor', css)) {
        var contents = range.extractContents();
        if (css === 'transparent') {
          // Strip existing background styles instead of wrapping
          _stripBackgrounds(contents);
          range.insertNode(contents);
        } else {
          var span = document.createElement('span');
          span.style.backgroundColor = css;
          span.appendChild(contents);
          range.insertNode(span);
          range.selectNodeContents(span);
        }
        _restoreRange(range);
      }
    } else if (_editorFocused()) {
      pendingBg = css;
    }
    updateCharCount();
  }
  function applyBold() {
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    if (!range.collapsed && range.toString().trim()) {
      _safeFocus();
      if (!_tryExec('bold')) {
        var contents = range.extractContents();
        // Toggle: check if start AND end of selection are inside <b> or <strong>
        var sc = range.startContainer;
        if (sc.nodeType === 3) sc = sc.parentNode;
        var ec = range.endContainer;
        if (ec.nodeType === 3) ec = ec.parentNode;
        var boldStart = sc && sc.closest && (sc.closest('b') || sc.closest('strong'));
        var boldEnd   = ec && ec.closest && (ec.closest('b') || ec.closest('strong'));
        var isBold = boldStart && boldEnd;
        if (isBold) {
          // Unwrap: insert contents outside the bold wrapper
          var boldEl = boldStart; // use the start container's bold wrapper
          if (boldEl.parentNode) {
            range.setStartAfter(boldEl);
            range.collapse(true);
          }
          range.insertNode(contents);
          range.selectNodeContents(contents);
        } else {
          var b = document.createElement('b');
          b.appendChild(contents);
          range.insertNode(b);
          range.selectNodeContents(b);
        }
        _restoreRange(range);
      }
    } else if (_editorFocused()) {
      pendingBold = true;
    }
    updateCharCount();
  }
  function applyUnderline() {
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    if (!range.collapsed && range.toString().trim()) {
      _safeFocus();
      if (!_tryExec('underline')) {
        var contents = range.extractContents();
        // Toggle: check if start AND end of selection are inside <u>
        var sc = range.startContainer;
        if (sc.nodeType === 3) sc = sc.parentNode;
        var ec = range.endContainer;
        if (ec.nodeType === 3) ec = ec.parentNode;
        var ulStart = sc && sc.closest && sc.closest('u');
        var ulEnd   = ec && ec.closest && ec.closest('u');
        var isUnderlined = ulStart && ulEnd;
        if (isUnderlined) {
          // Unwrap: insert contents outside the <u> wrapper
          var uEl = ulStart;
          if (uEl.parentNode) {
            range.setStartAfter(uEl);
            range.collapse(true);
          }
          range.insertNode(contents);
          range.selectNodeContents(contents);
        } else {
          var u = document.createElement('u');
          u.appendChild(contents);
          range.insertNode(u);
          range.selectNodeContents(u);
        }
        _restoreRange(range);
      }
    } else if (_editorFocused()) {
      pendingUnderline = true;
    }
    updateCharCount();
  }
  function applyRemoveFormat() {
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    if (!range.collapsed && range.toString().trim()) {
      _safeFocus();
      if (!_tryExec('removeFormat')) {
        var frag = range.extractContents();
        _stripFormatting(frag);
        range.insertNode(frag);
        _restoreRange(range);
      }
    } else if (_editorFocused()) {
      pendingFg = null;
      pendingBg = null;
      pendingBold = null;
      pendingUnderline = null;
      // Also clear browser's internal typing-style formatting state
      try { document.execCommand('removeFormat'); } catch(e) {}
    }
    updateCharCount();
  }

  // Presets
  var PRESETS = {
    rainbow: [FG[1],FG[3],FG[2],FG[6],FG[4],FG[5]],   // Red,Yellow,Green,Cyan,Blue,Magenta
    sunset:  [FG[1],FG[3],FG[5],FG[1]],                 // Red,Yellow,Magenta,Red
    ocean:   [FG[6],FG[4],FG[0],FG[6]],                 // Cyan,Blue,Gray,Cyan
    fire:    [FG[1],FG[3],FG[1],FG[3],FG[5]],           // Red,Yellow,Red,Yellow,Magenta
  };
  document.querySelectorAll('.preset-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var key = this.dataset.preset;
      if (PRESETS[key]) { sequence = PRESETS[key].slice(); updateSeqUI(); }
    });
  });

  // Character counter
  var charCount = document.getElementById('charCount');
  function updateCharCount() {
    var ansi = domToANSI(editor);
    var len = ansi ? ansi.length : 0;
    var max = 2000;
    charCount.textContent = len + ' / ' + max;
    charCount.className = 'char-count' + (len > max ? ' danger' : len > max * 0.9 ? ' warn' : '');
  }
  editor.addEventListener('input', updateCharCount);

  // Apply pending styles on next input (handles typing, IME, voice, paste)
  function _flushPending() {
    if (pendingFg) {
      try { document.execCommand('foreColor', false, pendingFg); } catch(e) {}
      pendingFg = null;
    }
    if (pendingBg) {
      try { document.execCommand('backColor', false, pendingBg); } catch(e) {}
      pendingBg = null;
    }
    if (pendingBold !== null) {
      // Use queryCommandState to avoid toggling when already in desired state
      var isBold = document.queryCommandState('bold');
      if (isBold !== pendingBold) {
        try { document.execCommand('bold'); } catch(e) {}
      }
      pendingBold = null;
    }
    if (pendingUnderline !== null) {
      var isUnder = document.queryCommandState('underline');
      if (isUnder !== pendingUnderline) {
        try { document.execCommand('underline'); } catch(e) {}
      }
      pendingUnderline = null;
    }
  }
  editor.addEventListener('keydown', _flushPending);
  // Also flush on input for non-keyboard methods: IME composition, voice dictation, paste
  editor.addEventListener('input', _flushPending);

  function updateSeqUI() {
    seqBlocks.innerHTML = sequence.length
      ? sequence.map(function(s,i) {
          return '<span class="seq-dot" title="'+s.name+' ('+(i+1)+')" style="background:'+s.css+'" data-idx="'+i+'"></span>';
        }).join('')
      : '<span class="seq-empty">Click color swatches above to build a sequence…</span>';
    seqApply.disabled = sequence.length === 0;
    seqClear.disabled = sequence.length === 0;
    // Click dot to remove from sequence
    seqBlocks.querySelectorAll('.seq-dot').forEach(function(d) {
      d.addEventListener('click', function() {
        sequence.splice(parseInt(this.dataset.idx, 10), 1);
        updateSeqUI();
      });
    });
  }

  function addToSeq(c) {
    sequence.push(c);
    updateSeqUI();
  }

  function applySequence() {
    var sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed || !sequence.length) return;
    var range = sel.getRangeAt(0);
    if (!range.toString()) return;
    _safeFocus();
    // Extract contents to preserve DOM structure (bold, underline wrappers)
    var extracted = range.extractContents();
    // Walk tree, collect text nodes, then replace each with per-character font elements
    var charIdx = 0;
    var walker = document.createTreeWalker(extracted, NodeFilter.SHOW_TEXT);
    var textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    for (var t = 0; t < textNodes.length; t++) {
      var textNode = textNodes[t];
      var parent = textNode.parentNode;
      var txt = textNode.textContent;
      if (!txt) continue;
      for (var i = 0; i < txt.length; i++) {
        var s = sequence[charIdx % sequence.length];
        charIdx++;
        var el = document.createElement('font');
        el.setAttribute('color', s.css);
        el.textContent = txt[i];
        // Insert colored character before the original text node;
        // existing structural wrappers (b, u) remain intact around these font elements
        parent.insertBefore(el, textNode);
      }
      parent.removeChild(textNode);
    }
    range.insertNode(extracted);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    updateCharCount();
  }

  // FG: colored circles — apply directly, don't touch sequence
  FG.forEach(function(c) {
    var b = document.createElement('button');
    b.className = 'swatch-btn';
    b.title = c.name;
    b.style.background = c.css;
    if (c.ansi === '37' || c.ansi === '33') b.style.borderColor = 'rgba(255,255,255,0.15)';
    b.addEventListener('pointerdown', function(e) {
      e.preventDefault();
      applyForeColor(c.css);
    });
    document.getElementById('fgRow').appendChild(b);
  });

  // BG: rounded squares — first one clears background
  (function() {
    var b = document.createElement('button');
    b.className = 'bg-swatch';
    b.title = 'No background';
    b.style.background = 'transparent';
    b.style.borderStyle = 'dashed';
    b.addEventListener('pointerdown', function(e) {
      e.preventDefault();
      applyBackColor('transparent');
    });
    document.getElementById('bgRow').appendChild(b);
  })();
  BG.forEach(function(c) {
    var b = document.createElement('button');
    b.className = 'bg-swatch';
    b.title = c.name;
    b.style.background = c.css;
    b.addEventListener('pointerdown', function(e) {
      e.preventDefault();
      applyBackColor(c.css);
    });
    document.getElementById('bgRow').appendChild(b);
  });

  // Sequence-only color buttons (foreground only)
  FG.forEach(function(c) {
    var b = document.createElement('button');
    b.className = 'seq-swatch';
    b.title = 'Add ' + c.name + ' to sequence';
    b.style.background = c.css;
    if (c.ansi === '37' || c.ansi === '33') b.style.borderColor = 'rgba(255,255,255,0.3)';
    b.addEventListener('click', function() { addToSeq(c); });
    document.getElementById('seqColors').appendChild(b);
  });

  // Sequence actions (pointerdown keeps selection alive on touch)
  seqApply.addEventListener('pointerdown', function(e) {
    e.preventDefault();
    applySequence();
  });
  seqClear.addEventListener('click', function() {
    sequence = [];
    updateSeqUI();
  });

  // Style
  document.getElementById('boldBtn').addEventListener('pointerdown', function(e) {
    e.preventDefault(); applyBold();
  });
  document.getElementById('underlineBtn').addEventListener('pointerdown', function(e) {
    e.preventDefault(); applyUnderline();
  });

  // Reset: strip formatting
  document.getElementById('resetBtn').addEventListener('pointerdown', function(e) {
    e.preventDefault(); applyRemoveFormat();
  });
  // Clear
  document.getElementById('clearBtn').addEventListener('click', function() {
    editor.innerHTML = ''; _safeFocus(); updateCharCount();
  });

  // DOM → ANSI
  function parseRGB(s) {
    var m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    return m ? { r:parseInt(m[1]), g:parseInt(m[2]), b:parseInt(m[3]), a:m[4]!==undefined?parseFloat(m[4]):1 } : null;
  }
  function closest(r,g,b,t) {
    var best=t[0], bestD=Infinity;
    for (var i=0;i<t.length;i++) {
      var dr=r-t[i].r, dg=g-t[i].g, db=b-t[i].b, d=dr*dr+dg*dg+db*db;
      if (d<bestD) { bestD=d; best=t[i]; }
    }
    return best.ansi;
  }

  function domToANSI(root) {
    var lines=[], cur='', lastPrefix='';
    (function walk(node,st) {
      if (node.nodeType===3) {
        var parts=node.textContent.split('\n');
        for (var i=0;i<parts.length;i++) {
          if (i>0) { lines.push(cur); cur=''; lastPrefix=''; }
          if (!parts[i]) continue;
          var p=['0'];  // Always start with reset to prevent color bleed in Discord
          if (st.bold) p.push('1');
          if (st.underline) p.push('4');
          p.push(st.fg);
          if (st.bg) p.push(st.bg);
          var prefix='['+p.join(';')+'m';
          if (prefix===lastPrefix) { cur+=parts[i]; }
          else { cur+=prefix+parts[i]; lastPrefix=prefix; }
        }
        return;
      }
      if (node.nodeType!==1) return;
      var tag=node.tagName.toLowerCase();
      // Inject newline for block-level elements and <br>
      if (tag==='br'||tag==='div'||tag==='p') {
        lines.push(cur); cur=''; lastPrefix='';
      }
      var ns={ fg:st.fg, bg:st.bg, bold:st.bold, underline:st.underline };
      if (/^(font|span|b|u|strong|em)$/.test(tag)) {
        var cs=getComputedStyle(node);
        var fgR=parseRGB(cs.color);
        if (fgR) ns.fg=closest(fgR.r,fgR.g,fgR.b,FG_RGB);
        if (cs.fontWeight==='bold'||parseInt(cs.fontWeight)>=700) ns.bold=true;
        if (cs.textDecoration.indexOf('underline')!==-1) ns.underline=true;
        // Use computed style for background detection — handles inline style,
        // CSS class, and transparent correctly
        var bgR=parseRGB(cs.backgroundColor);
        if (bgR&&bgR.a>0) {
          ns.bg=closest(bgR.r,bgR.g,bgR.b,BG_RGB);
        } else if (node.style&&node.style.backgroundColor==='transparent') {
          // Explicit transparent: clear inherited background
          ns.bg=null;
        }
      }
      if (tag==='b'||tag==='strong') ns.bold=true;
      if (tag==='u') ns.underline=true;
      for (var i=0;i<node.childNodes.length;i++) walk(node.childNodes[i],ns);
      // After block-level elements, push another line break
      if (tag==='div'||tag==='p') {
        lines.push(cur); cur=''; lastPrefix='';
      }
    })(root,{ fg:'37', bg:null, bold:false, underline:false });
    if (cur||lines.length===0) lines.push(cur);
    return lines.join('\n');
  }

  function copy() {
    if (!editor.textContent.trim()) return;
    var ansi=domToANSI(editor);
    if (!ansi) return;
    var md='```ansi\n'+ansi+'\n```';
    if (navigator.clipboard&&navigator.clipboard.writeText) {
      navigator.clipboard.writeText(md).then(flash).catch(fc);
    } else fc();
    function fc() {
      var ta=document.createElement('textarea');
      ta.value=md; ta.style.position='fixed'; ta.style.left='-9999px';
      document.body.appendChild(ta); ta.focus(); ta.select();
      try {
        var ok=document.execCommand('copy');
        if (ok) flash();
      } catch(e) {}
      document.body.removeChild(ta);
    }
  }

  function flash() {
    copyBtn.classList.add('copied');
    copyBtn.innerHTML='<span>✓</span> Copied!';
    toast.classList.add('show');
    setTimeout(function() {
      copyBtn.classList.remove('copied');
      copyBtn.innerHTML='📋 Copy ANSI';
      toast.classList.remove('show');
    },2000);
  }

  copyBtn.addEventListener('click', copy);
  editor.focus();
})();
