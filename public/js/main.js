// ============================================================
// PJAX — swap #main-content without reloading the full page
// (keeps Spotify player alive across navigation)
// ============================================================

var _pageBaseTitle = document.title;
var _balloonLayers = [];
var _mobileHeaderCollapsed = false;

function pjaxSwap(html, url) {
  var parser = new DOMParser();
  var doc = parser.parseFromString(html, 'text/html');
  var newMain = doc.getElementById('main-content');
  if (!newMain) return false;
  document.getElementById('main-content').innerHTML = newMain.innerHTML;
  _pageBaseTitle = doc.title;
  document.title = doc.title;
  window.scrollTo(0, 0);
  closeLightbox();
  initPage();
  return true;
}

function pjaxNavigate(url, push) {
  fetch(url)
    .then(function(res) {
      var finalUrl = res.url;
      // Handle hash anchor: res.url strips hash, re-attach from original if same path
      return res.text().then(function(html) { return { html: html, url: finalUrl }; });
    })
    .then(function(result) {
      if (pjaxSwap(result.html, result.url)) {
        if (push !== false) {
          history.pushState({ pjax: true }, document.title, result.url);
        }
        // Scroll to hash if present in original url
        var hash = typeof url === 'string' && url.indexOf('#') !== -1
          ? url.slice(url.indexOf('#') + 1) : null;
        if (hash) {
          var el = document.getElementById(hash);
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }
      }
    })
    .catch(function() {
      window.location.href = url; // fallback: full reload
    });
}

// Intercept internal link clicks
document.addEventListener('click', function(e) {
  var a = e.target.closest('a');
  if (!a || !a.href) return;
  if (a.target === '_blank' || a.hasAttribute('download')) return;
  // Same origin only
  if (a.hostname !== location.hostname) return;
  // Skip hash-only links on the same page
  if (a.pathname === location.pathname && a.hash && !a.search) {
    return; // let browser handle anchor scroll
  }
  e.preventDefault();
  pjaxNavigate(a.href);
});

// Browser back/forward
window.addEventListener('popstate', function() {
  pjaxNavigate(location.href, false);
});

// Intercept form submissions for PJAX
document.addEventListener('submit', function(e) {
  var form = e.target;
  // Only intercept POST forms
  if (form.method.toUpperCase() !== 'POST') return;
  // Skip multipart (file uploads) - these need special handling
  if (form.enctype === 'multipart/form-data') return;
  // Skip auth forms (login, register, logout) - they need full page refresh
  if (form.action && (form.action.includes('/login') || form.action.includes('/register') || form.action.includes('/logout'))) return;
  // Must have an action
  if (!form.action) return;

  // Check for confirm message via data-confirm attribute
  var confirmMsg = form.getAttribute('data-confirm');
  if (confirmMsg && !confirm(confirmMsg)) {
    e.preventDefault();
    return;
  }

  e.preventDefault();

  var params = new URLSearchParams();
  var formData = new FormData(form);
  for (var pair of formData.entries()) {
    params.append(pair[0], pair[1]);
  }

  fetch(form.action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  })
    .then(function(res) {
      return res.text().then(function(html) {
        if (pjaxSwap(html, res.url)) {
          history.pushState({ pjax: true }, '', res.url);
        }
      });
    })
    .catch(function(err) {
      console.error('Form submission error:', err);
    });
});

// ============================================================
// LIGHTBOX (layout element — init once)
// ============================================================

function openLightbox(src, caption) {
  var lb = document.getElementById('lightbox');
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox-caption').textContent = caption || '';
  lb.classList.add('open');
}

function closeLightbox() {
  var lb = document.getElementById('lightbox');
  if (lb) lb.classList.remove('open');
}

function updateMobileHeader() {
  var isMobile = window.matchMedia('(max-width: 768px)').matches;
  if (!isMobile) {
    document.body.classList.remove('mobile-header-collapsed');
    _mobileHeaderCollapsed = false;
    return;
  }

  var collapsed = (window.scrollY || window.pageYOffset || 0) > 24;
  if (collapsed === _mobileHeaderCollapsed) return;
  _mobileHeaderCollapsed = collapsed;
  document.body.classList.toggle('mobile-header-collapsed', collapsed);
}

function updateBalloonParallax() {
  if (!_balloonLayers.length) return;
  var y = window.scrollY || window.pageYOffset || 0;
  _balloonLayers.forEach(function(layer, i) {
    var speed = i === 0 ? 0.55 : 0.85;
    var direction = i === 0 ? -1 : 1;
    layer.style.transform = 'translate3d(0, ' + (y * speed * direction) + 'px, 0)';
  });
}

function initBalloonLayout() {
  var balloonColumns = document.querySelectorAll('.balloon-column');
  var isMobile = window.matchMedia('(max-width: 768px)').matches;
  document.body.classList.toggle('is-mobile', isMobile);
  document.getElementById('balloon-parallax').style.display = isMobile ? 'none' : '';
  if (isMobile) return;
  balloonColumns.forEach(function(column, columnIndex) {
    var images = Array.prototype.slice.call(column.querySelectorAll('img'));
    var height = window.innerHeight || 800;
    var columnWidth = column.offsetWidth || 260;
    var spread = column.classList.contains('balloon-center')
      ? Math.max(320, Math.min(760, Math.round(columnWidth * 1.3)))
      : Math.max(140, Math.min(260, Math.round(columnWidth * 1.05)));

    images.forEach(function(img, i) {
      if (isMobile) {
        var keep = column.classList.contains('balloon-center') && i < 3;
        img.style.display = keep ? 'block' : 'none';
        if (!keep) return;
      } else {
        img.style.display = 'block';
      }

      var top = Math.round((Math.random() * 0.82 + 0.04) * height);
      var sideOffset = Math.round((Math.random() * spread) - (spread / 2));
      var scale = (1.0 + Math.random() * 0.55).toFixed(2);
      var rotate = Math.round((Math.random() * 28) - 14);
      var drift = Math.round((Math.random() * 40) - 20);
      var speed = (1.4 + Math.random() * 2.1).toFixed(2);

      img.style.top = top + 'px';
      if (column.classList.contains('balloon-left')) {
        img.style.left = Math.max(-20, Math.min(columnWidth - 40, Math.round(sideOffset + drift))) + 'px';
      } else if (column.classList.contains('balloon-center')) {
        var vw = window.innerWidth || 1200;
        var x = Math.round((Math.random() * 0.9 + 0.05) * vw);
        img.style.left = Math.max(-40, Math.min(vw - 80, x + drift)) + 'px';
      } else {
        img.style.right = Math.max(-20, Math.min(columnWidth - 40, Math.round(sideOffset + drift))) + 'px';
      }
      img.dataset.speed = speed;
      img.dataset.baseTop = String(top);
      img.dataset.baseLeft = img.style.left || '';
      img.dataset.baseRight = img.style.right || '';
      img.dataset.baseTransform = 'scale(' + scale + ') rotate(' + rotate + 'deg)';
      img.style.transform = img.dataset.baseTransform;
      img.style.zIndex = String(10 + i);
      img.dataset.parallaxDrift = String(drift);
    });
  });
}

function updateBalloonPositions() {
  var y = window.scrollY || window.pageYOffset || 0;
  document.querySelectorAll('.balloon-column img').forEach(function(img) {
    var speed = parseFloat(img.dataset.speed || '1');
    var drift = parseFloat(img.dataset.parallaxDrift || '0');
    var baseTop = parseFloat(img.dataset.baseTop || '0');
    var baseTransform = img.dataset.baseTransform || '';
    var translateY = y * speed * 0.22;
    img.style.top = (baseTop + translateY * 0.22) + 'px';
    img.style.transform = baseTransform + ' translate3d(0, ' + translateY + 'px, 0)';
    if (img.parentElement && img.parentElement.classList.contains('balloon-left')) {
      img.style.left = (parseFloat(img.dataset.baseLeft || '0') + Math.sin((y / (120 + speed * 25)) + drift) * 28) + 'px';
    } else if (img.parentElement && img.parentElement.classList.contains('balloon-center')) {
      img.style.left = (parseFloat(img.dataset.baseLeft || '0') + Math.sin((y / (90 + speed * 18)) + drift) * 42) + 'px';
    } else {
      img.style.right = (parseFloat(img.dataset.baseRight || '0') + Math.cos((y / (120 + speed * 25)) + drift) * 28) + 'px';
    }
  });
}

document.getElementById('lightbox').addEventListener('click', function(e) {
  if (e.target === this) closeLightbox();
});

// ============================================================
// SIDEBAR GALLERY (layout element — init once)
// ============================================================

function initSidebarGallery() {
  var items = document.querySelectorAll('.photo-grid-item');
  items.forEach(function(item) {
    item.addEventListener('click', function() {
      var caption = item.dataset.caption ? JSON.parse(item.dataset.caption) : '';
      openLightbox(item.dataset.src, caption);
    });
  });
}

// ============================================================
// KEYBOARD SHORTCUTS (global — init once)
// ============================================================

document.addEventListener('keydown', function(e) {
  var lb = document.getElementById('lightbox');
  if (lb && lb.classList.contains('open')) {
    if (e.key === 'Escape') closeLightbox();
    return;
  }
});

// ============================================================
// PAGE-SPECIFIC INIT — called after every PJAX swap
// ============================================================

var photoFiles = [];

function initPage() {
  photoFiles = []; // reset upload state for article forms
  initEditor();
  initArticleFormSubmit();
  initPhotoUpload();
  updateBalloonParallax();
  initBalloonLayout();
  updateBalloonPositions();
  updateMobileHeader();
}

// Article editor toolbar
function initEditor() {
  var toolbar = document.getElementById('editor-toolbar');
  if (!toolbar) return;

  // Clone to remove old listeners
  var newToolbar = toolbar.cloneNode(true);
  toolbar.parentNode.replaceChild(newToolbar, toolbar);

  newToolbar.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-cmd]');
    if (!btn) return;
    e.preventDefault();
    document.getElementById('article-editor').focus();
    document.execCommand(btn.dataset.cmd, false, btn.dataset.val || null);
  });

  var fontSizeSelect = document.getElementById('font-size-select');
  if (fontSizeSelect) {
    fontSizeSelect.addEventListener('change', function() {
      document.getElementById('article-editor').focus();
      document.execCommand('fontSize', false, this.value);
    });
  }

  var colorPicker = document.getElementById('text-color-picker');
  if (colorPicker) {
    colorPicker.addEventListener('input', function() {
      document.getElementById('article-editor').focus();
      document.execCommand('foreColor', false, this.value);
    });
  }
}

// Photo upload preview
function initPhotoUpload() {
  var addPhotoBtn = document.getElementById('add-photo-btn');
  if (!addPhotoBtn) return;

  var newBtn = addPhotoBtn.cloneNode(true);
  addPhotoBtn.parentNode.replaceChild(newBtn, addPhotoBtn);

  newBtn.addEventListener('click', function() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.addEventListener('change', function() {
      Array.from(this.files).forEach(addPhotoPreview);
    });
    input.click();
  });
}

function addPhotoPreview(file) {
  var reader = new FileReader();
  reader.onload = function(e) {
    var container = document.getElementById('photo-previews');
    if (!container) return;
    var idx = photoFiles.length;
    photoFiles.push(file);
    var item = document.createElement('div');
    item.className = 'photo-upload-item';
    item.innerHTML =
      '<img src="' + e.target.result + '" alt="">' +
      '<button type="button" class="remove-photo" onclick="removePhoto(this,' + idx + ')">✕</button>';
    container.appendChild(item);
  };
  reader.readAsDataURL(file);
}

function removePhoto(btn, idx) {
  photoFiles[idx] = null;
  btn.closest('.photo-upload-item').remove();
}

function initArticleFormSubmit() {
  var form = document.getElementById('article-form');
  if (!form) return;

  var newForm = form.cloneNode(true);
  form.parentNode.replaceChild(newForm, form);

  newForm.addEventListener('submit', function(e) {
    e.preventDefault();

    var editor = document.getElementById('article-editor');
    if (editor) document.getElementById('article-content-input').value = editor.innerHTML;

    var formData = new FormData(newForm);
    formData.delete('photos');
    photoFiles.forEach(function(file) { if (file) formData.append('photos', file); });

    fetch(newForm.action, { method: 'POST', body: formData })
      .then(function(res) {
        // Use PJAX to show result without reloading layout
        return res.text().then(function(html) {
          history.pushState({ pjax: true }, '', res.url);
          pjaxSwap(html, res.url);
        });
      })
      .catch(function(err) { console.error(err); });
  });
}

// ============================================================
// BOOT
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
  _balloonLayers = [
    document.querySelector('.balloon-left'),
    document.querySelector('.balloon-right')
  ].filter(Boolean);
  initBalloonLayout();
  updateBalloonParallax();
  updateBalloonPositions();
  window.addEventListener('scroll', updateBalloonParallax, { passive: true });
  window.addEventListener('scroll', updateBalloonPositions, { passive: true });
  initSidebarGallery();
  initPage();
  window.addEventListener('scroll', updateMobileHeader, { passive: true });
});

// ============================================================
// VOTING — AJAX, no page reload
// ============================================================

function vote(btn) {
  var articleId = btn.dataset.id;
  var val = parseInt(btn.dataset.val);
  fetch('/article/' + articleId + '/vote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: val })
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    // Update both buttons in the same .article-votes container
    var container = btn.closest('.article-votes') || btn.closest('.vote-bar');
    if (!container) return;
    var buttons = container.querySelectorAll('.vote-btn');
    buttons.forEach(function(b) {
      var bVal = parseInt(b.dataset.val);
      b.classList.remove('vote-active-up', 'vote-active-down');
      if (bVal === 1) {
        b.querySelector('span').textContent = data.upvotes;
        if (data.userVote === 1) b.classList.add('vote-active-up');
      } else {
        b.querySelector('span').textContent = data.downvotes;
        if (data.userVote === -1) b.classList.add('vote-active-down');
      }
    });
  })
  .catch(function(err) { console.error('vote error', err); });
}

// ============================================================
// SPARKLY CURSOR TRAIL — classic Skyblog glitter effect
// ============================================================
(function() {
  var COLORS = ['#ff69b4', '#fff', '#ffdd00', '#ff90c8', '#cc44ff', '#00eeff'];
  var CHARS  = ['✦', '★', '✸', '·', '✽', '⋆', '✺'];

  var pool = []; // recycle DOM nodes

  function spawn(x, y) {
    var el = pool.pop() || document.createElement('span');
    el.className = 'spark';
    el.textContent = CHARS[Math.floor(Math.random() * CHARS.length)];
    el.style.color  = COLORS[Math.floor(Math.random() * COLORS.length)];
    el.style.left   = (x + (Math.random() * 20 - 10)) + 'px';
    el.style.top    = (y + (Math.random() * 20 - 10)) + 'px';
    el.style.fontSize = (10 + Math.random() * 14) + 'px';
    el.style.opacity = '1';
    el.style.transform = 'translate(-50%, -50%) scale(1) rotate(' + (Math.random()*360) + 'deg)';
    el.style.transition = 'none';
    document.body.appendChild(el);

    // Force reflow then animate out
    el.getBoundingClientRect();
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    el.style.opacity = '0';
    el.style.transform = 'translate(-50%, -50%) scale(0) rotate(' + (Math.random()*720) + 'deg)';

    setTimeout(function() {
      if (el.parentNode) el.parentNode.removeChild(el);
      pool.push(el);
    }, 620);
  }

  var throttle = false;
  document.addEventListener('mousemove', function(e) {
    if (throttle) return;
    throttle = true;
    requestAnimationFrame(function() {
      spawn(e.clientX, e.clientY);
      throttle = false;
    });
  });
})();
