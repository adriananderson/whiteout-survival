'use strict';

const Input = (() => {
  const keys    = {};
  const pressed = {};
  const mouse   = { x: 0, y: 0, leftDown: false, leftUp: false, rightUp: false };

  // Virtual touch controls shared with Renderer
  const TouchUI = {
    isMobile: ('ontouchstart' in window) || navigator.maxTouchPoints > 0,
    hitAreas: [],   // [{key, x, y, w, h}] — rebuilt every frame by Renderer
    joy: {
      active: false, id: -1,
      baseX: 0, baseY: 0,
      thumbDx: 0, thumbDy: 0,
      dx: 0, dy: 0,
    },
  };

  const JOY_R    = 70;
  const JOY_DEAD = 0.18;
  let _cvs;

  function init(canvas) {
    _cvs = canvas;

    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (!keys[k]) { keys[k] = true; pressed[k] = true; }
      if (!keys[e.code]) { keys[e.code] = true; pressed[e.code] = true; }
    });
    window.addEventListener('keyup', e => {
      keys[e.key.toLowerCase()] = false;
      keys[e.code] = false;
    });

    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      mouse.x = (e.clientX - r.left) * (canvas.width  / r.width);
      mouse.y = (e.clientY - r.top)  * (canvas.height / r.height);
    });
    canvas.addEventListener('mousedown', e => {
      if (e.button === 0) mouse.leftDown = true;
      e.preventDefault();
    });
    canvas.addEventListener('mouseup', e => {
      if (e.button === 0) { mouse.leftDown = false; mouse.leftUp = true; }
      if (e.button === 2) mouse.rightUp = true;
      e.preventDefault();
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    if (TouchUI.isMobile) {
      canvas.addEventListener('touchstart',  _onStart, { passive: false });
      canvas.addEventListener('touchmove',   _onMove,  { passive: false });
      canvas.addEventListener('touchend',    _onEnd,   { passive: false });
      canvas.addEventListener('touchcancel', _onEnd,   { passive: false });
    }
  }

  function _cpos(t) {
    const r = _cvs.getBoundingClientRect();
    return {
      x: (t.clientX - r.left) * (_cvs.width  / r.width),
      y: (t.clientY - r.top)  * (_cvs.height / r.height),
    };
  }

  function _onStart(e) {
    e.preventDefault();
    const W = _cvs.width, H = _cvs.height;
    for (const t of e.changedTouches) {
      const { x, y } = _cpos(t);

      // Check hit areas first (last-registered = highest priority)
      let hit = false;
      for (let i = TouchUI.hitAreas.length - 1; i >= 0; i--) {
        const a = TouchUI.hitAreas[i];
        if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) {
          pressed[a.key] = true;
          hit = true;
          break;
        }
      }
      if (hit) continue;

      // Joystick zone: left 40% of screen, bottom 45% — only if no hit area matched
      if (!TouchUI.joy.active && x < W * 0.40 && y > H * 0.55) {
        TouchUI.joy.active  = true;
        TouchUI.joy.id      = t.identifier;
        TouchUI.joy.baseX   = x;
        TouchUI.joy.baseY   = y;
        TouchUI.joy.thumbDx = 0;
        TouchUI.joy.thumbDy = 0;
        TouchUI.joy.dx      = 0;
        TouchUI.joy.dy      = 0;
        continue;
      }

      // Fallthrough → mouse tap
      mouse.x = x; mouse.y = y;
      mouse.leftDown = true;
    }
  }

  function _onMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === TouchUI.joy.id) {
        const { x, y } = _cpos(t);
        const dx = x - TouchUI.joy.baseX;
        const dy = y - TouchUI.joy.baseY;
        const dist = Math.hypot(dx, dy);
        const capped = Math.min(dist, JOY_R);
        const n = dist > 0.1 ? dist : 1;
        TouchUI.joy.thumbDx = (dx / n) * capped;
        TouchUI.joy.thumbDy = (dy / n) * capped;
        const inDead = dist < JOY_R * JOY_DEAD;
        TouchUI.joy.dx = inDead ? 0 : dx / n;
        TouchUI.joy.dy = inDead ? 0 : dy / n;
      } else {
        const { x, y } = _cpos(t);
        mouse.x = x; mouse.y = y;
      }
    }
  }

  function _onEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === TouchUI.joy.id) {
        TouchUI.joy.active  = false;
        TouchUI.joy.id      = -1;
        TouchUI.joy.thumbDx = 0;
        TouchUI.joy.thumbDy = 0;
        TouchUI.joy.dx      = 0;
        TouchUI.joy.dy      = 0;
      } else {
        const { x, y } = _cpos(t);
        mouse.x = x; mouse.y = y;
        mouse.leftDown = false;
        mouse.leftUp   = true;
      }
    }
  }

  function wasPressed(k)    { return !!(pressed[k.toLowerCase()] || pressed[k]); }
  function flushPressed()   { for (const k in pressed) delete pressed[k]; }
  function consumeLeftUp()  { const v = mouse.leftUp;  mouse.leftUp  = false; return v; }
  function consumeRightUp() { const v = mouse.rightUp; mouse.rightUp = false; return v; }
  function isDown(k)        { return !!(keys[k.toLowerCase()] || keys[k]); }

  return { init, isDown, wasPressed, flushPressed, consumeLeftUp, consumeRightUp, mouse, TouchUI };
})();
