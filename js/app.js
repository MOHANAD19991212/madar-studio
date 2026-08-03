/* ═══════════════════════════════════════════════════════════
   مدار — محرك التفاعل والحركة
   بدون أي اعتماديات خارجية.
   ─────────────────────────────────────────────────────────
   01 · أدوات ومحرّك الإطارات      07 · اللاصق والعدّادات
   02 · التمرير الناعم              08 · القائمة والترويسة
   03 · المؤشر المخصص               09 · الأكورديون والسحب
   04 · تقسيم الأسطر والظهور        10 · الانتقال بين الصفحات
   05 · الشريط المتحرك              11 · شاشة التحميل
   06 · المغناطيس والبارالاكس       12 · الإقلاع
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ─────────────────────────────────────────────
     01 · أدوات ومحرّك الإطارات
     ───────────────────────────────────────────── */
  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  var lerp  = function (a, b, t) { return a + (b - a) * t; };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  /* معامل الاستيفاء المستقل عن معدّل الإطارات (60fps مرجعًا) */
  var damp = function (a, b, factor, dt) {
    return lerp(a, b, 1 - Math.pow(1 - factor, dt / 16.667));
  };

  var AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  var toArabic = function (n) {
    return String(n).replace(/\d/g, function (d) { return AR_DIGITS[+d]; });
  };

  var mqCoarse  = window.matchMedia('(hover: none)');
  var mqReduce  = window.matchMedia('(prefers-reduced-motion: reduce)');
  var isTouch   = function () { return mqCoarse.matches; };
  var isReduced = function () { return mqReduce.matches; };

  /* محرّك إطارات واحد يغذّي كل الوحدات */
  var Ticker = {
    subs: [],
    last: 0,
    running: false,
    add: function (fn) { this.subs.push(fn); this.start(); },
    start: function () {
      if (this.running) return;
      this.running = true;
      this.last = performance.now();
      /* نربط الدالة مرة واحدة: bind داخل الحلقة كان يُنشئ دالة جديدة
         كل إطار (٦٠ كائنًا في الثانية) فيُثقل جامع القمامة بلا داعٍ */
      if (!this._bound) this._bound = this.loop.bind(this);
      requestAnimationFrame(this._bound);
    },
    loop: function (now) {
      var dt = Math.min(now - this.last, 64);
      this.last = now;
      for (var i = 0; i < this.subs.length; i++) this.subs[i](dt, now);
      requestAnimationFrame(this._bound);
    }
  };

  /* ناقل أحداث بسيط لمشاركة حالة التمرير */
  var State = { y: 0, target: 0, velocity: 0, vh: window.innerHeight, docH: 0 };

  /* ─────────────────────────────────────────────
     02 · التمرير الناعم
     يعتمد على التمرير الأصلي مع استيفاء الموضع،
     ما يحافظ على عمل position:sticky والمراقبات.
     ───────────────────────────────────────────── */
  var Scroll = (function () {
    var enabled = false;
    var target = 0, current = 0;
    var lockedBy = null;
    var EASE = 0.115;
    var SYNC_TOL = 2;   /* px — أقل من ذلك يُعتبر صدى لتمريرنا نحن */

    function maxScroll() {
      return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    }

    function onWheel(e) {
      if (!enabled || lockedBy) return;
      if (e.ctrlKey) return;                       /* تكبير المتصفح */
      if (e.target.closest && e.target.closest('[data-native-scroll]')) return;
      e.preventDefault();
      var d = e.deltaY;
      if (e.deltaMode === 1) d *= 18;              /* أسطر */
      else if (e.deltaMode === 2) d *= window.innerHeight;
      target = clamp(target + d, 0, maxScroll());
    }

    function onKey(e) {
      if (!enabled || lockedBy) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      var vh = window.innerHeight, step = null;
      switch (e.key) {
        case 'ArrowDown':  step = 110; break;
        case 'ArrowUp':    step = -110; break;
        case 'PageDown':   step = vh * 0.86; break;
        case 'PageUp':     step = -vh * 0.86; break;
        case ' ':          step = e.shiftKey ? -vh * 0.86 : vh * 0.86; break;
        case 'Home':       e.preventDefault(); target = 0; return;
        case 'End':        e.preventDefault(); target = maxScroll(); return;
      }
      if (step === null) return;
      e.preventDefault();
      target = clamp(target + step, 0, maxScroll());
    }

    /* إعادة المزامنة عند التمرير من خارج العجلة (شريط التمرير، اللمس، #مرساة).
       نقارن بالموضع المتوقّع بدل استخدام راية، لأن أحداث scroll غير متزامنة
       وقد يصل حدثان بعد إطارين فتضيع الراية وتُقتل الحركة في منتصفها. */
    function onNativeScroll() {
      if (Math.abs(window.scrollY - current) <= SYNC_TOL) return;
      target = current = window.scrollY;
    }

    function frame(dt) {
      State.vh = window.innerHeight;
      State.docH = maxScroll();

      if (enabled && !lockedBy) {
        var prev = current;
        current = damp(current, target, EASE, dt);
        if (Math.abs(target - current) < 0.08) current = target;
        if (Math.abs(current - window.scrollY) > 0.05) window.scrollTo(0, current);
        State.velocity = current - prev;
      } else {
        var y = window.scrollY;
        State.velocity = y - current;
        current = target = y;
      }
      State.y = current;
      State.target = target;
    }

    function enable() {
      if (enabled || isTouch() || isReduced()) return;
      enabled = true;
      target = current = window.scrollY;
      window.addEventListener('wheel', onWheel, { passive: false });
      window.addEventListener('keydown', onKey, { passive: false });
      document.documentElement.classList.remove('no-smooth');
    }

    function disable() {
      enabled = false;
      window.removeEventListener('wheel', onWheel, { passive: false });
      window.removeEventListener('keydown', onKey, { passive: false });
      document.documentElement.classList.add('no-smooth');
    }

    window.addEventListener('scroll', onNativeScroll, { passive: true });
    Ticker.add(frame);

    return {
      init: function () { enabled ? null : enable(); },
      lock: function (key) {
        lockedBy = key;
        document.documentElement.classList.add('is-locked');
      },
      unlock: function () {
        lockedBy = null;
        document.documentElement.classList.remove('is-locked');
        target = current = window.scrollY;
      },
      to: function (y, instant) {
        y = clamp(y, 0, maxScroll());
        target = y;
        if (instant || !enabled) { current = y; window.scrollTo(0, y); }
      },
      get enabled() { return enabled; }
    };
  })();

  /* ─────────────────────────────────────────────
     03 · المؤشر المخصص
     ───────────────────────────────────────────── */
  var Cursor = (function () {
    var el, inner, label, mediaBox;
    var x = 0, y = 0, tx = 0, ty = 0;
    var state = '';
    var live = false;

    var STATES = ['-pointer', '-text', '-media', '-hidden', '-drag'];

    function setState(next, opts) {
      /* المحتوى يُحدَّث دائمًا: الانتقال بين بطاقتين بنفس الحالة
         لكن بلوحة ألوان مختلفة يجب أن يبدّل صورة المؤشر أيضًا */
      if (opts && opts.label) label.textContent = opts.label;
      if (opts && opts.media) mediaBox.setAttribute('style', opts.media);
      if (state === next && (!opts || !opts.force)) return;
      state = next;
      STATES.forEach(function (s) { el.classList.remove(s); });
      if (next) el.classList.add('-' + next);
    }

    function resolve(node) {
      if (!node || !node.closest) return null;
      var hit = node.closest('[data-cursor]');
      if (hit) {
        return {
          state: hit.getAttribute('data-cursor'),
          label: hit.getAttribute('data-cursor-label') || '',
          media: hit.getAttribute('data-cursor-media') || ''
        };
      }
      if (node.closest('a, button, input, textarea, [role="button"]')) {
        return { state: 'pointer', label: '', media: '' };
      }
      return null;
    }

    function onMove(e) {
      tx = e.clientX; ty = e.clientY;
      if (!live) {
        live = true;
        x = tx; y = ty;
        el.classList.add('is-live');
        document.documentElement.classList.add('has-cursor');
      }
      /* أي حركة تعني أن الفأرة داخل الصفحة — نتعافى من mouseleave أو blur
         حتى لو لم يصل mouseenter مقابل (يحدث بعد تبديل النوافذ) */
      if (el.classList.contains('is-out')) el.classList.remove('is-out');
      var r = resolve(e.target);
      if (r) setState(r.state, { label: r.label, media: r.media });
      else setState('');
    }

    function frame(dt) {
      if (!live) return;
      x = damp(x, tx, 0.22, dt);
      y = damp(y, ty, 0.22, dt);
      inner.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0)';
    }

    return {
      init: function () {
        el = $('.md-cursor');
        if (!el || isTouch()) return;
        inner    = $('.md-cursor__inner', el);
        label    = $('.md-cursor__label', el);
        mediaBox = $('.md-cursor__media-box', el);

        window.addEventListener('mousemove', onMove, { passive: true });
        document.addEventListener('mouseleave', function () { el.classList.add('is-out'); });
        document.addEventListener('mouseenter', function () { el.classList.remove('is-out'); });
        window.addEventListener('blur', function () { el.classList.add('is-out'); });
        Ticker.add(frame);
      },
      force: function (s, opts) { if (el) setState(s, Object.assign({ force: true }, opts || {})); },
      hide:  function () { if (el) el.classList.add('is-out'); },
      show:  function () { if (el) el.classList.remove('is-out'); }
    };
  })();

  /* ─────────────────────────────────────────────
     04 · تقسيم الأسطر وحركات الظهور
     ───────────────────────────────────────────── */
  var Reveal = (function () {
    var io = null;
    var splitNodes = [];

    /* يلفّ كل كلمة في span مع الحفاظ على تشكيل الحروف العربية */
    function wrapWords(root, bag) {
      Array.prototype.slice.call(root.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          if (!n.textContent.trim()) return;
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (!part.trim()) { frag.appendChild(document.createTextNode(' ')); return; }
            var s = document.createElement('span');
            s.className = 'md-w';
            s.style.display = 'inline-block';
            s.textContent = part;
            frag.appendChild(s);
            bag.push(s);
          });
          root.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') {
          wrapWords(n, bag);
        }
      });
    }

    function split(el) {
      if (el._mdSplit) return;
      el._mdHTML = el.innerHTML;
      var words = [];
      wrapWords(el, words);
      if (!words.length) { el._mdSplit = true; return; }

      /* تجميع الكلمات حسب موضعها العمودي = سطر واحد */
      var groups = [], last = null;
      words.forEach(function (w) {
        var top = Math.round(w.offsetTop);
        if (!last || Math.abs(top - last.top) > 3) {
          last = { top: top, items: [w] };
          groups.push(last);
        } else last.items.push(w);
      });

      var base = parseFloat(el.getAttribute('data-anim-delay') || 0);
      el.innerHTML = '';
      groups.forEach(function (g, i) {
        var line  = document.createElement('span');
        var inner = document.createElement('span');
        line.className = 'md-line';
        inner.className = 'md-line__i';
        inner.style.setProperty('--d', (base + i * 0.085).toFixed(3) + 's');
        g.items.forEach(function (w, j) {
          inner.appendChild(w);
          if (j < g.items.length - 1) inner.appendChild(document.createTextNode(' '));
        });
        line.appendChild(inner);
        el.appendChild(line);
      });
      el._mdSplit = true;
      splitNodes.push(el);
    }

    function resplit() {
      /* نأخذ نسخة من القائمة أولًا لأن split() يعيد الإضافة إليها أثناء المرور */
      var list = splitNodes.slice();
      splitNodes.length = 0;
      list.forEach(function (el) {
        if (!el._mdHTML) return;
        var wasIn = el.classList.contains('is-in');
        el.innerHTML = el._mdHTML;
        el._mdSplit = false;
        el._mdHTML = null;
        split(el);
        if (wasIn) el.classList.add('is-in');
      });
    }

    function observe(el) {
      if (el.getAttribute('data-anim') === 'lines') split(el);
      else {
        var d = el.getAttribute('data-anim-delay');
        if (d) el.style.setProperty('--d', d + 's');
      }
      io.observe(el);
    }

    return {
      init: function () {
        io = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (!en.isIntersecting) return;
            en.target.classList.add('is-in');
            io.unobserve(en.target);
            if (en.target.hasAttribute('data-count')) Counters.run(en.target);
            var counts = $$('[data-count]', en.target);
            counts.forEach(function (c) { Counters.run(c); });
          });
        }, { rootMargin: '0px 0px -12% 0px', threshold: 0 });

        $$('[data-anim]').forEach(observe);

        var t;
        window.addEventListener('resize', function () {
          clearTimeout(t);
          t = setTimeout(resplit, 220);
        });
      },
      add: observe
    };
  })();

  /* ─────────────────────────────────────────────
     05 · الشريط المتحرك (يتأثر بسرعة التمرير)
     ───────────────────────────────────────────── */
  var Marquee = (function () {
    var items = [];

    function build(el) {
      var track = $('.md-marquee__track', el);
      if (!track) return null;
      var base = track.innerHTML;
      /* المسافة بين النسختين تُحتسب ضمن طول الدورة وإلا ظهرت قفزة كل لفّة */
      var gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      var w = track.scrollWidth + gap;
      var need = Math.ceil((window.innerWidth * 2) / Math.max(w, 1)) + 1;
      for (var i = 0; i < need; i++) track.innerHTML += base;
      return {
        el: el,
        track: track,
        width: w,
        pos: 0,
        speed: parseFloat(el.getAttribute('data-marquee-speed') || 0.6)
      };
    }

    function frame(dt) {
      var f = dt / 16.667;
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var boost = clamp(Math.abs(State.velocity) * 0.055, 0, 6);
        it.pos += (it.speed + boost) * f;
        if (it.pos >= it.width) it.pos -= it.width;
        /* في RTL تُرصَف النسخ يسار الإطار، فالإزاحة الموجبة هي التي تسحبها إلى داخله */
        it.track.style.transform = 'translate3d(' + it.pos.toFixed(2) + 'px,0,0)';
      }
    }

    return {
      init: function () {
        items = $$('[data-marquee]').map(build).filter(Boolean);
        if (items.length) Ticker.add(frame);
      }
    };
  })();

  /* ─────────────────────────────────────────────
     06 · المغناطيس والبارالاكس
     ───────────────────────────────────────────── */
  var Magnetic = (function () {
    var items = [];

    function bind(el) {
      var item = { el: el, x: 0, y: 0, tx: 0, ty: 0, active: false, set: false };
      var pad = 26;

      function enter() { item.active = true; }
      function leave() { item.active = false; item.tx = 0; item.ty = 0; }
      function move(e) {
        var r = el.getBoundingClientRect();
        var cx = r.left + r.width / 2;
        var cy = r.top + r.height / 2;
        var dx = e.clientX - cx;
        var dy = e.clientY - cy;
        var max = Math.max(r.width, r.height) / 2 + pad;
        var dist = Math.hypot(dx, dy);
        if (dist > max * 1.6) { leave(); return; }
        var pull = 0.34;
        item.tx = dx * pull;
        item.ty = dy * pull;
      }

      el.addEventListener('mouseenter', enter);
      el.addEventListener('mouseleave', leave);
      el.addEventListener('mousemove', move);
      items.push(item);
    }

    /* نكتب متغيّرات CSS لا transform مباشرة، وإلا مُسح أي تحويل أساسي
       على العنصر — مثل translate(-50%,-50%) الذي يوسّط زرّ التشغيل */
    function frame(dt) {
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        it.x = damp(it.x, it.tx, 0.18, dt);
        it.y = damp(it.y, it.ty, 0.18, dt);
        if (Math.abs(it.x) < 0.02 && Math.abs(it.y) < 0.02 && !it.active) {
          if (it.set) {
            it.el.style.removeProperty('--mx');
            it.el.style.removeProperty('--my');
            it.set = false;
          }
          continue;
        }
        it.el.style.setProperty('--mx', it.x.toFixed(2) + 'px');
        it.el.style.setProperty('--my', it.y.toFixed(2) + 'px');
        it.set = true;
      }
    }

    return {
      init: function () {
        if (isTouch() || isReduced()) return;
        $$('[data-magnetic]').forEach(bind);
        if (items.length) Ticker.add(frame);
      }
    };
  })();

  var Parallax = (function () {
    var items = [];

    function frame() {
      var vh = window.innerHeight;
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var r = it.el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) continue;
        /* ‎-1 أعلى الشاشة · 1 أسفلها */
        var p = (r.top + r.height / 2 - vh / 2) / (vh / 2 + r.height / 2);
        var shift = clamp(p, -1.4, 1.4) * it.amount;
        it.el.style.transform = 'translate3d(0,' + shift.toFixed(2) + '%,0)';
      }
    }

    return {
      init: function () {
        if (isReduced()) return;
        items = $$('[data-parallax]').map(function (el) {
          return { el: el, amount: parseFloat(el.getAttribute('data-parallax')) || -6 };
        });
        if (items.length) Ticker.add(frame);
      }
    };
  })();

  /* ─────────────────────────────────────────────
     07 · القسم اللاصق والعدّادات وشريط التقدّم
     ───────────────────────────────────────────── */
  var Feature = (function () {
    var items = [], arts = [], active = -1;

    function frame() {
      if (!items.length) return;
      var mid = window.innerHeight * 0.5;
      var best = 0, bestD = Infinity;
      for (var i = 0; i < items.length; i++) {
        var r = items[i].getBoundingClientRect();
        var d = Math.abs(r.top + r.height / 2 - mid);
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best === active) return;
      active = best;
      for (var j = 0; j < arts.length; j++) arts[j].classList.toggle('is-active', j === best);
    }

    return {
      init: function () {
        var root = $('[data-feature]');
        if (!root) return;
        items = $$('[data-feature-item]', root);
        arts  = $$('[data-feature-art]', root);
        if (items.length && arts.length) Ticker.add(frame);
      }
    };
  })();

  var Counters = (function () {
    return {
      run: function (el) {
        if (el._mdCounted) return;
        el._mdCounted = true;
        var to = parseFloat(el.getAttribute('data-count')) || 0;
        var suffix = el.getAttribute('data-count-suffix') || '';
        var dur = 1600, t0 = performance.now();
        function step(now) {
          var p = clamp((now - t0) / dur, 0, 1);
          var e = 1 - Math.pow(1 - p, 3);
          el.textContent = toArabic(Math.round(to * e)) + suffix;
          if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      }
    };
  })();

  var Progress = (function () {
    var bar;
    function frame() {
      if (!bar) return;
      var max = State.docH || 1;
      bar.style.transform = 'scaleX(' + clamp(State.y / max, 0, 1).toFixed(4) + ')';
    }
    return {
      init: function () {
        bar = $('[data-progress]');
        if (bar) Ticker.add(frame);
      }
    };
  })();

  /* يبدّل لون الترويسة فوق الأقسام الداكنة */
  var Inverse = (function () {
    var zones = [], head, on = false;

    function frame() {
      if (!head) return;
      var probe = head.offsetHeight * 0.55;
      var hit = false;
      for (var i = 0; i < zones.length; i++) {
        var r = zones[i].getBoundingClientRect();
        if (r.top <= probe && r.bottom >= probe) { hit = true; break; }
      }
      if (hit === on) return;
      on = hit;
      document.body.classList.toggle('is-inverse', hit);
    }

    return {
      init: function () {
        head = $('.md-head');
        zones = $$('[data-inverse], .md-foot');
        if (head) Ticker.add(frame);
      }
    };
  })();

  /* ─────────────────────────────────────────────
     08 · القائمة والترويسة وتبديل الروابط
     ───────────────────────────────────────────── */
  var Header = (function () {
    var head, last = 0;

    function frame() {
      if (!head) return;
      var y = State.y;
      head.classList.toggle('is-stuck', y > 24);
      if (!document.body.classList.contains('is-menu')) {
        var down = y > last && y > 260;
        head.classList.toggle('is-hidden', down);
      }
      last = y;
    }

    return {
      init: function () {
        head = $('.md-head');
        if (head) Ticker.add(frame);

        /* تمييز الصفحة الحالية */
        var page = document.body.getAttribute('data-page');
        $$('.md-nav a').forEach(function (a) {
          var href = a.getAttribute('href') || '';
          if (page && href.indexOf(page) === 0) a.classList.add('is-current');
        });
      }
    };
  })();

  var Menu = (function () {
    var menu, burger, open = false;

    function toggle(next) {
      open = next === undefined ? !open : next;
      menu.classList.toggle('is-open', open);
      menu.setAttribute('aria-hidden', open ? 'false' : 'true');
      document.body.classList.toggle('is-menu', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.setAttribute('aria-label', open ? 'إغلاق القائمة' : 'فتح القائمة');
      open ? Scroll.lock('menu') : Scroll.unlock();
    }

    return {
      init: function () {
        menu   = $('.md-menu');
        burger = $('.md-burger');
        if (!menu || !burger) return;

        $$('.md-menu__nav a', menu).forEach(function (a, i) {
          a.style.setProperty('--i', i);
          $$('.md-menu__idx, .md-menu__txt', a).forEach(function (s) { s.style.setProperty('--i', i); });
        });

        burger.addEventListener('click', function () { toggle(); });
        window.addEventListener('keydown', function (e) {
          if (e.key === 'Escape' && open) toggle(false);
        });
        menu.addEventListener('click', function (e) {
          if (e.target.closest('a')) setTimeout(function () { toggle(false); }, 20);
        });
      },
      close: function () { if (open) toggle(false); }
    };
  })();

  var LinkSwap = (function () {
    return {
      init: function () {
        $$('[data-link-swap]').forEach(function (el) {
          if (el._mdSwap) return;
          var txt = el.textContent.trim();
          el.innerHTML = '';
          var a = document.createElement('span');
          var b = document.createElement('span');
          a.className = 'sw sw-a'; a.textContent = txt;
          b.className = 'sw sw-b'; b.textContent = txt;
          b.setAttribute('aria-hidden', 'true');
          el.appendChild(a);
          el.appendChild(b);
          el._mdSwap = true;
        });
      }
    };
  })();

  /* ─────────────────────────────────────────────
     09 · الأكورديون والسحب الأفقي
     ───────────────────────────────────────────── */
  var Accordion = (function () {
    function setup(root) {
      var items = $$('.md-acc__item', root);
      items.forEach(function (item) {
        var q = $('.md-acc__q', item);
        var a = $('.md-acc__a', item);
        var inner = $('.md-acc__in', item);
        if (!q || !a || !inner) return;

        q.addEventListener('click', function () {
          var willOpen = !item.classList.contains('is-open');

          items.forEach(function (o) {
            if (o === item) return;
            var oa = $('.md-acc__a', o);
            if (o.classList.contains('is-open')) {
              oa.style.height = oa.scrollHeight + 'px';
              requestAnimationFrame(function () { oa.style.height = '0px'; });
              o.classList.remove('is-open');
              $('.md-acc__q', o).setAttribute('aria-expanded', 'false');
            }
          });

          if (willOpen) {
            item.classList.add('is-open');
            q.setAttribute('aria-expanded', 'true');
            a.style.height = inner.offsetHeight + 'px';
            var done = function (ev) {
              if (ev.target !== a || ev.propertyName !== 'height') return;
              a.removeEventListener('transitionend', done);
              /* قد يكون المستخدم أغلقه قبل انتهاء الحركة — لا نثبّت auto حينها */
              if (item.classList.contains('is-open')) a.style.height = 'auto';
            };
            a.addEventListener('transitionend', done);
          } else {
            a.style.height = a.scrollHeight + 'px';
            requestAnimationFrame(function () { a.style.height = '0px'; });
            item.classList.remove('is-open');
            q.setAttribute('aria-expanded', 'false');
          }
        });
      });
    }

    return {
      init: function () { $$('[data-acc]').forEach(setup); }
    };
  })();

  var Drag = (function () {
    var items = [];

    function setup(root) {
      var track = $('[data-drag-track]', root);
      if (!track) return;

      var it = { root: root, track: track, pos: 0, target: 0, min: 0, max: 0, down: false, startX: 0, startPos: 0, moved: 0 };

      /* في RTL تفيض البطاقات يسار الإطار، فالتقدّم للأمام = إزاحة موجبة */
      function bounds() {
        it.min = 0;
        /* نقيس على صندوق المسار لا على الحاوية، وإلا حُسب الحشو مرتين
           فتتوقّف آخر بطاقة قبل حافتها */
        it.max = Math.max(0, track.scrollWidth - track.clientWidth);
        it.target = clamp(it.target, it.min, it.max);
      }
      bounds();
      window.addEventListener('resize', bounds);

      root.addEventListener('pointerdown', function (e) {
        it.down = true; it.moved = 0;
        it.startX = e.clientX;
        it.startPos = it.target;
        root.classList.add('is-grabbing');
        root.setPointerCapture(e.pointerId);
        Cursor.force('drag', { label: 'اسحب' });
      });

      root.addEventListener('pointermove', function (e) {
        if (!it.down) return;
        var dx = e.clientX - it.startX;
        it.moved = Math.abs(dx);
        it.target = clamp(it.startPos + dx, it.min, it.max);
      });

      function up(e) {
        if (!it.down) return;
        it.down = false;
        root.classList.remove('is-grabbing');
        try { root.releasePointerCapture(e.pointerId); } catch (err) {}
      }
      root.addEventListener('pointerup', up);
      root.addEventListener('pointercancel', up);

      root.addEventListener('click', function (e) {
        if (it.moved > 6) { e.preventDefault(); e.stopPropagation(); }
      }, true);

      root.addEventListener('wheel', function (e) {
        if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
        e.preventDefault();
        e.stopPropagation();
        it.target = clamp(it.target + e.deltaX, it.min, it.max);
      }, { passive: false });

      items.push(it);
    }

    function frame(dt) {
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        it.pos = damp(it.pos, it.target, 0.14, dt);
        it.track.style.transform = 'translate3d(' + it.pos.toFixed(2) + 'px,0,0)';
      }
    }

    return {
      init: function () {
        $$('[data-drag]').forEach(setup);
        if (items.length) Ticker.add(frame);
      }
    };
  })();

  /* ─────────────────────────────────────────────
     فيديو الواجهة — تشغيل تلقائي صامت + مفتاح صوت
     ───────────────────────────────────────────── */
  var Video = (function () {
    function stamp(sec) {
      if (!isFinite(sec)) return '';
      var m = Math.floor(sec / 60), s = Math.round(sec % 60);
      if (s === 60) { m++; s = 0; }
      return toArabic(('0' + m).slice(-2)) + ':' + toArabic(('0' + s).slice(-2));
    }

    /* هل نُحمّل الفيديو تلقائيًا؟ القرار يوازن بين أثر الواجهة
       وبين بيانات الزائر — الملف يُحمّل كاملًا عند كل زيارة. */
    function autoAllowed() {
      if (isReduced()) return false;                 /* تفضيل صريح لتقليل الحركة */

      var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (c) {
        if (c.saveData) return false;                /* وضع توفير البيانات مفعّل */
        var t = c.effectiveType;
        if (t === 'slow-2g' || t === '2g' || t === '3g') return false;
      }

      /* الجوال غالبًا على بيانات محدودة — وإن غاب connection نحتاط */
      if (isTouch() || window.innerWidth < 820) return false;

      return true;
    }

    function setup(box) {
      var v = $('[data-video-el]', box);
      if (!v) return;
      var btn   = $('[data-video-btn]', box);
      var label = $('[data-video-label]', box);
      var bar   = $('[data-video-bar]', box);
      var time  = $('[data-video-time]', box);
      var src   = v.getAttribute('data-src');
      if (!src) return;

      var loaded = false;
      var visible = true;

      function load() {
        if (loaded) return;
        loaded = true;
        v.preload = 'auto';
        v.src = src;
      }

      function play() {
        var p = v.play();
        if (p && p.catch) p.catch(function () { box.classList.remove('is-live'); });
      }

      v.addEventListener('loadeddata', function () { box.classList.add('is-ready'); });
      v.addEventListener('loadedmetadata', function () {
        if (time) time.textContent = stamp(v.duration);
      });
      /* التشغيل الفعلي هو الحكم الوحيد على حالة الزرّ */
      v.addEventListener('playing', function () {
        box.classList.add('is-ready', 'is-live');
        if (label) label.textContent = v.muted ? 'الصوت' : 'كتم';
        if (btn) btn.setAttribute('aria-label', v.muted ? 'تشغيل الصوت' : 'كتم الصوت');
      });

      /* ── المسار التلقائي ── */
      if (autoAllowed()) {
        v.muted = true;
        v.defaultMuted = true;
        load();
        play();
      }

      /* ── الزرّ ── تشغيل يدوي قبل البدء، ومفتاح صوت بعده ── */
      if (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (!box.classList.contains('is-live')) {
            /* نقرة صريحة من المستخدم ⇒ يُسمح بالصوت */
            v.muted = false;
            box.classList.add('is-sound');
            load();
            play();
            return;
          }
          v.muted = !v.muted;
          box.classList.toggle('is-sound', !v.muted);
          if (label) label.textContent = v.muted ? 'الصوت' : 'كتم';
          btn.setAttribute('aria-label', v.muted ? 'تشغيل الصوت' : 'كتم الصوت');
        });
      }

      /* يوقف التشغيل خارج الشاشة — لا فائدة من فكّ ترميز لا يراه أحد.
         لا يُشغّل ما لم يكن قد بدأ فعلًا، حتى لا يتجاوز قرار الشرط. */
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (en) {
          visible = en[0].isIntersecting;
          if (!loaded) return;
          if (visible) { if (v.paused) play(); }
          else if (!v.paused) v.pause();
        }, { threshold: 0.05 }).observe(box);
      }

      if (bar) {
        Ticker.add(function () {
          if (!loaded || !v.duration || !isFinite(v.duration)) return;
          bar.style.transform = 'scaleX(' + clamp(v.currentTime / v.duration, 0, 1).toFixed(4) + ')';
        });
      }
    }

    return { init: function () { $$('[data-video]').forEach(setup); } };
  })();

  /* اختيار الشرائح في نموذج التواصل */
  var Chips = (function () {
    return {
      init: function () {
        $$('.md-chip').forEach(function (c) {
          c.addEventListener('click', function () {
            var on = c.classList.toggle('is-on');
            /* الحالة تُنقل لقارئ الشاشة أيضًا، لا باللون وحده */
            c.setAttribute('aria-pressed', on ? 'true' : 'false');
          });
        });
        var form = $('[data-form]');
        if (!form) return;
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var btn = $('[data-form-btn] span', form);
          if (btn) btn.textContent = 'وصلتنا رسالتك · شكرًا لك';
        });
      }
    };
  })();

  /* ─────────────────────────────────────────────
     10 · الانتقال بين الصفحات
     ───────────────────────────────────────────── */
  var Transition = (function () {
    var curtain, busy = false;
    var COVER = 850;

    function isInternal(a) {
      if (!a) return false;
      if (a.target && a.target !== '_self') return false;
      if (a.hasAttribute('download')) return false;
      var href = a.getAttribute('href');
      if (!href) return false;
      if (/^(mailto:|tel:|#|javascript:)/i.test(href)) return false;
      var url;
      try { url = new URL(a.href, location.href); } catch (e) { return false; }
      if (url.origin !== location.origin) return false;
      if (url.pathname === location.pathname && url.hash) return false;
      return true;
    }

    function leave(url) {
      if (busy) return;
      busy = true;
      Menu.close();
      Cursor.hide();
      curtain.classList.remove('is-reveal');
      curtain.classList.add('is-cover');
      setTimeout(function () {
        try { sessionStorage.setItem('md-transit', '1'); } catch (e) {}
        location.href = url;
      }, COVER);
    }

    function enter() {
      var entering = document.documentElement.classList.contains('is-entering');
      try { sessionStorage.removeItem('md-transit'); } catch (e) {}
      if (!entering) return false;

      window.scrollTo(0, 0);
      curtain.classList.add('no-anim', 'is-cover');
      void curtain.offsetHeight;
      document.documentElement.classList.remove('is-entering');
      void curtain.offsetHeight;

      requestAnimationFrame(function () {
        curtain.classList.remove('no-anim');
        requestAnimationFrame(function () {
          curtain.classList.remove('is-cover');
          curtain.classList.add('is-reveal');
          setTimeout(function () {
            curtain.classList.remove('is-reveal');
            Cursor.show();
          }, 1000);
        });
      });
      return true;
    }

    return {
      init: function () {
        curtain = $('.md-curtain');
        if (!curtain) return false;

        if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

        document.addEventListener('click', function (e) {
          if (e.defaultPrevented) return;
          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          var a = e.target.closest('a');
          if (!isInternal(a)) return;
          if (a.href === location.href) { e.preventDefault(); Scroll.to(0); return; }
          e.preventDefault();
          leave(a.href);
        });

        /* عودة المتصفح من الذاكرة المخبأة */
        window.addEventListener('pageshow', function (e) {
          if (e.persisted) {
            busy = false;
            curtain.classList.remove('is-cover', 'is-reveal', 'no-anim');
            Cursor.show();
          }
        });

        return enter();
      }
    };
  })();

  /* ─────────────────────────────────────────────
     11 · شاشة التحميل
     ───────────────────────────────────────────── */
  var Loader = (function () {
    return {
      run: function (skip, done) {
        var el = $('.md-loader');
        if (!el || skip) {
          if (el) el.remove();
          document.documentElement.classList.add('no-loader');
          done();
          return;
        }

        var num = $('[data-loader-num]', el);
        var bar = $('.md-loader__bar i', el);
        var p = 0, real = 0, loaded = false, finished = false;

        window.addEventListener('load', function () { loaded = true; });
        setTimeout(function () { loaded = true; }, 3200);

        /* الإنهاء يمرّ من هنا حصرًا، ومرة واحدة: هو ما يُفعّل التمرير
           ويضيف is-ready. لو نُودي مرتين لأُعيد تهيئة التمرير بلا داعٍ. */
        function finish() {
          if (finished) return;
          finished = true;
          el.classList.add('is-done');
          done();
          setTimeout(function () { if (el.parentNode) el.remove(); }, 1100);
        }

        /* شبكة أمان: شريط التقدّم يعتمد على requestAnimationFrame، وهذا
           يتوقّف في التبويبات الخلفية. بدونها يبقى الغطاء الكامل ظاهرًا
           ويظلّ التمرير معطّلًا — أي موقع غير قابل للاستخدام إطلاقًا. */
        var guard = setTimeout(finish, 6000);

        var t0 = performance.now();
        function step(now) {
          var elapsed = now - t0;
          real = clamp(elapsed / 1250, 0, 1);
          var cap = loaded ? 1 : 0.9;
          p = Math.min(real, cap);
          var shown = Math.round(p * 100);
          if (num) num.textContent = toArabic(shown);
          if (bar) bar.style.transform = 'scaleX(' + p.toFixed(3) + ')';
          if (p < 1) { requestAnimationFrame(step); return; }
          clearTimeout(guard);
          setTimeout(finish, 180);
        }
        requestAnimationFrame(step);
      }
    };
  })();

  /* ─────────────────────────────────────────────
     11.5 · عرض المشاريع من مصدر بيانات واحد
     يقرأ window.NOON_PROJECTS (js/projects-data.js) ويملأ:
     - [data-projects-grid]     شبكة الأعمال الكاملة (work.html)
     - [data-projects-home]     أول ٦ مشاريع (index.html)
     - [data-project-detail]    صفحة دراسة حالة واحدة حسب ?id= (project.html)
     يعمل قبل أي وحدة أخرى في boot() حتى تجد Reveal/Parallax/Cursor
     العناصر المُولَّدة جاهزة في DOM عند مسحها.
     ───────────────────────────────────────────── */
  var Projects = (function () {
    var DATA = window.NOON_PROJECTS || [];

    /* تنقية المخرجات — البيانات نكتبها نحن، لكن الترميز يُبنى بـ innerHTML
       فأي محرّر يضيف مشروعًا لاحقًا قد يُدخل نصًا فيه < أو " دون قصد.
       الهروب هنا يمنع كسر البنية وأي حقن محتمل. */
    var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    function esc(v) {
      return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ESC[c]; });
    }

    /* الألوان تُحقن في سمة style — نقبل صيغة hex فقط ونرفض ما عداها،
       فلا يمكن تمرير إعلان CSS إضافي عبر حقل اللون */
    function hex(v, fallback) {
      return /^#[0-9a-fA-F]{3,8}$/.test(String(v || '')) ? v : fallback;
    }

    /* المعرّف يدخل في الرابط ومسار الصورة — أرقام وحروف فقط */
    function safeId(v) {
      return /^[A-Za-z0-9_-]{1,32}$/.test(String(v || '')) ? v : '';
    }

    function metaLine(p) {
      return esc(p.tags[0]) + ' · ' + esc(p.tags[1]) + ' · ' + esc(p.year);
    }

    /* أبعاد الصور المصدرية — تُكتب على كل <img> فيحجز المتصفح المساحة
       قبل التحميل ولا يقفز التخطيط (Cumulative Layout Shift) */
    var IMG_W = 1200, IMG_H = 1190;

    function tileHTML(p, i) {
      var id = safeId(p.id);
      var delayAttr = (i % 2 === 1) ? ' data-anim-delay="0.08"' : '';
      var loading = (i === 0) ? 'eager' : 'lazy';
      var tags = p.tags.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('');
      return '' +
        '<article class="md-tile" data-anim="frame"' + delayAttr + '>' +
          '<a href="project.html?id=' + id + '" class="md-tile__art" data-cursor="text" data-cursor-label="المشروع">' +
            '<img class="md-tile__img" src="assets/work/' + id + '.jpg" alt="' + esc(p.alt) + '" ' +
              'width="' + IMG_W + '" height="' + IMG_H + '" ' +
              'loading="' + loading + '" decoding="async" data-parallax="-6">' +
          '</a>' +
          '<div class="md-tile__row"><h2 class="md-tile__name">' + esc(p.name) + '</h2><span class="md-tile__year">' + esc(p.year) + '</span></div>' +
          '<p class="md-tile__desc">' + esc(p.lead) + '</p>' +
          '<div class="md-tile__tags">' + tags + '</div>' +
        '</article>';
    }

    function workItemHTML(p, no) {
      var id = safeId(p.id);
      return '' +
        '<a class="md-work" href="project.html?id=' + id + '" data-cursor="media" ' +
          'data-cursor-media="background-image:url(\'assets/work/' + id + '.jpg\');background-size:cover;background-position:center">' +
          '<span class="md-work__no">' + toArabic(no) + '</span>' +
          '<span class="md-work__name">' + esc(p.name) + '</span>' +
          '<span class="md-work__desc">' + esc(p.lead) + '</span>' +
          '<span class="md-work__meta">' + metaLine(p) + '</span>' +
          '<span class="md-work__line"></span>' +
        '</a>';
    }

    function renderGrid() {
      var el = $('[data-projects-grid]');
      if (!el) return;
      el.innerHTML = DATA.map(tileHTML).join('');
    }

    /* بطاقة مروَّحة — تبدأ متكدّسة في المنتصف ثم تنفتح كأوراق اللعب.
       ‎--dx‎ إزاحة البداية نحو المركز · ‎--rot/--dy‎ وضعها النهائي */
    var ROT = [-6, 4, -3, 5, -5, 3, -4, 6];
    var DY  = [1.2, 4, 0, 5, 1.6, 3.2, 0.8, 4.4];

    function deckCardHTML(p, i, total) {
      var id  = safeId(p.id);
      var mid = (total - 1) / 2;
      /* في RTL العنصر الأول يقع أقصى اليمين، فيتحرّك يسارًا (سالبًا) نحو المركز */
      var dx  = ((i - mid) * 4).toFixed(1);
      return '' +
        '<a class="md-deck__card" href="project.html?id=' + id + '" data-cursor="pointer" ' +
          'style="--bg:' + hex(p.bg, '#231f20') + ';--fg:' + hex(p.fg, '#ffffff') + ';--rot:' + ROT[i % ROT.length] + 'deg;' +
          '--dy:' + DY[i % DY.length] + 'rem;--dx:' + dx + 'rem;--d:' + (i * 0.075).toFixed(3) + 's;z-index:' + (i + 1) + '">' +
          '<span class="md-deck__title">' + esc(p.name) + '</span>' +
          '<span class="md-deck__art">' +
            /* alt فارغ عمدًا: اسم المشروع مكتوب فوق الصورة، فلا يُقرأ مرتين */
            '<img src="assets/work/' + id + '.jpg" alt="" ' +
              'width="' + IMG_W + '" height="' + IMG_H + '" ' +
              'loading="lazy" decoding="async">' +
          '</span>' +
        '</a>';
    }

    function renderHome() {
      var el = $('[data-projects-home]');
      if (!el) return;
      var list = DATA.slice(0, 6);
      el.innerHTML = list.map(function (p, i) {
        return deckCardHTML(p, i, list.length);
      }).join('');
    }

    function renderDetail() {
      var root = $('[data-project-detail]');
      if (!root || !DATA.length) return;

      var params = new URLSearchParams(location.search);
      var reqId = params.get('id');
      var project = DATA.filter(function (p) { return p.id === reqId; })[0] || DATA[0];
      var idx = DATA.indexOf(project);

      document.title = project.name + ' — نون الاحترافية';
      var metaDesc = $('meta[data-project-meta]');
      if (metaDesc) metaDesc.setAttribute('content', project.lead);

      var cap = $('[data-project-cap]', root);
      if (cap) cap.textContent = project.type + ' · ' + project.year;

      var h1 = $('[data-project-title]', root);
      if (h1) h1.textContent = project.name;

      var lead = $('[data-project-lead]', root);
      if (lead) lead.textContent = project.lead;

      var hero = $('[data-project-hero]', root);
      if (hero) {
        hero.setAttribute('width', IMG_W);
        hero.setAttribute('height', IMG_H);
        hero.setAttribute('decoding', 'async');
        hero.setAttribute('fetchpriority', 'high');   /* صورة LCP لهذه الصفحة */
        hero.setAttribute('src', 'assets/work/' + safeId(project.id) + '.jpg');
        hero.setAttribute('alt', project.alt);
      }

      /* الرابط المرجعي يجب أن يشير إلى المشروع المعروض لا إلى القالب،
         وإلا رأت محركات البحث ثماني صفحات بمرجع واحد */
      var canon = $('link[rel="canonical"]');
      if (canon) {
        canon.setAttribute('href',
          canon.getAttribute('href').split('?')[0] + '?id=' + safeId(project.id));
      }
      var ogUrl = $('meta[property="og:url"]');
      if (ogUrl) {
        ogUrl.setAttribute('content',
          ogUrl.getAttribute('content').split('?')[0] + '?id=' + safeId(project.id));
      }
      /* صورة المشاركة تتبع المشروع أيضًا */
      ['og:image', 'twitter:image'].forEach(function (prop) {
        var m = $('meta[property="' + prop + '"]') || $('meta[name="' + prop + '"]');
        if (m) {
          var base = (m.getAttribute('content') || '').replace(/assets\/work\/[^/]+$/, '');
          m.setAttribute('content', base + 'assets/work/' + safeId(project.id) + '.jpg');
        }
      });
      ['og:title', 'twitter:title'].forEach(function (prop) {
        var m = $('meta[property="' + prop + '"]') || $('meta[name="' + prop + '"]');
        if (m) m.setAttribute('content', project.name + ' — نون الاحترافية');
      });
      ['og:description', 'twitter:description'].forEach(function (prop) {
        var m = $('meta[property="' + prop + '"]') || $('meta[name="' + prop + '"]');
        if (m) m.setAttribute('content', project.lead);
      });

      ['type', 'sector', 'year', 'scope'].forEach(function (k) {
        var f = $('[data-project-fact="' + k + '"]', root);
        if (f) f.textContent = project[k];
      });

      var body = $('[data-project-body]', root);
      if (body) {
        body.innerHTML = project.sections.map(function (s) {
          return '<h2 data-anim="lines">' + esc(s.h) + '</h2><p data-anim="fade">' + esc(s.p) + '</p>';
        }).join('');
      }

      var relEl = $('[data-projects-related]', root);
      if (relEl && DATA.length > 1) {
        var rel = [];
        for (var k = 1; k <= 3 && k < DATA.length; k++) rel.push(DATA[(idx + k) % DATA.length]);
        relEl.innerHTML = rel.map(function (p, i) {
          return workItemHTML(p, ('0' + (i + 1)).slice(-2));
        }).join('');
      }
    }

    return {
      init: function () {
        if (!DATA.length) return;
        renderGrid();
        renderHome();
        renderDetail();
      }
    };
  })();

  /* ─────────────────────────────────────────────
     12 · الإقلاع
     ───────────────────────────────────────────── */
  function boot() {
    var skipLoader = Transition.init();          /* true إذا وصلنا عبر انتقال */

    Projects.init();                              /* قبل أي مسح آخر لـ DOM */
    Cursor.init();
    LinkSwap.init();
    Header.init();
    Menu.init();
    Accordion.init();
    Drag.init();
    Chips.init();
    Video.init();
    Feature.init();
    Parallax.init();
    Progress.init();
    Inverse.init();
    Magnetic.init();

    /* يُنتظر تحميل الخطوط قبل قياس الأسطر لتفادي إعادة التقسيم */
    var start = function () {
      Reveal.init();
      Marquee.init();
    };
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(start).catch(start);
    } else start();

    Loader.run(skipLoader, function () {
      Scroll.init();
      document.body.classList.add('is-ready');
    });

    /* تمرير سلس للمراسي الداخلية */
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute('href');
      /* ‎href="#"‎ وحده يقفز بالصفحة إلى أعلاها — سلوك مكسور
         لروابط التواصل التي تنتظر عناوينها الحقيقية */
      if (id === '#') { e.preventDefault(); return; }
      if (id.length < 2) return;
      var t = document.querySelector(id);
      if (!t) return;
      e.preventDefault();
      Scroll.to(window.scrollY + t.getBoundingClientRect().top - 96);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else boot();

  window.MADAR = { Scroll: Scroll, Cursor: Cursor, Reveal: Reveal, State: State };
})();
