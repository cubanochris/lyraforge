/* ════════════════════════════════════════════════════════════════════
   LYRAFORGE — Main Site JS
   Nav | Scroll animations | Counters | Mobile menu
   ════════════════════════════════════════════════════════════════════ */
"use strict";

document.addEventListener('DOMContentLoaded', () => {

  // ── Navigation scroll behaviour ──────────────────────────────────
  const nav = document.querySelector('.nav');
  let lastY = 0;

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    nav.classList.toggle('nav--scrolled', y > 60);
    nav.classList.toggle('nav--hidden',   y > lastY && y > 200);
    lastY = y;
  }, { passive: true });

  // ── Mobile menu toggle ────────────────────────────────────────────
  const burger = document.querySelector('.nav-burger');
  const drawer = document.querySelector('.nav-drawer');
  if (burger && drawer) {
    burger.addEventListener('click', () => {
      const open = drawer.classList.toggle('open');
      burger.setAttribute('aria-expanded', open);
      burger.classList.toggle('active', open);
    });
    // Close on link click
    drawer.querySelectorAll('a').forEach(a =>
      a.addEventListener('click', () => {
        drawer.classList.remove('open');
        burger.classList.remove('active');
        burger.setAttribute('aria-expanded', false);
      })
    );
  }

  // ── Intersection-based reveal animations ─────────────────────────
  const REVEAL_CLASS = 'revealed';
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add(REVEAL_CLASS);
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('[data-reveal]').forEach(el => observer.observe(el));

  // Staggered child reveals
  document.querySelectorAll('[data-reveal-group]').forEach(group => {
    const groupObs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.querySelectorAll('[data-reveal-item]').forEach((item, i) => {
            setTimeout(() => item.classList.add(REVEAL_CLASS), i * 110);
          });
          groupObs.unobserve(e.target);
        }
      });
    }, { threshold: 0.08 });
    groupObs.observe(group);
  });

  // ── Animated stat counters ────────────────────────────────────────
  function easeOutExpo(t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); }

  function animateCounter(el) {
    const target = parseFloat(el.dataset.target);
    const suffix = el.dataset.suffix || '';
    const prefix = el.dataset.prefix || '';
    const decimals = el.dataset.decimals ? parseInt(el.dataset.decimals) : 0;
    const duration = 1800;
    const start = performance.now();

    function step(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const value = easeOutExpo(progress) * target;
      el.textContent = prefix + value.toFixed(decimals) + suffix;
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  const statObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        animateCounter(e.target);
        statObserver.unobserve(e.target);
      }
    });
  }, { threshold: 0.5 });

  document.querySelectorAll('[data-counter]').forEach(el => statObserver.observe(el));

  // ── Smooth scroll for anchor links ───────────────────────────────
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.querySelector(a.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // ── Feature card tilt (subtle 3D on hover, desktop only) ─────────
  if (window.matchMedia('(hover: hover)').matches) {
    document.querySelectorAll('.fc-shell').forEach(shell => {
      shell.addEventListener('mousemove', e => {
        const r = shell.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width  - 0.5;
        const y = (e.clientY - r.top)  / r.height - 0.5;
        shell.style.transform = `perspective(800px) rotateY(${x * 5}deg) rotateX(${-y * 3.5}deg)`;
      });
      shell.addEventListener('mouseleave', () => {
        shell.style.transform = '';
      });
    });
  }

  // ── Typing headline effect (hero sub-tagline) ─────────────────────
  const typeEl = document.querySelector('[data-type]');
  if (typeEl) {
    const phrases = typeEl.dataset.type.split('|');
    let pi = 0, ci = 0, deleting = false, waiting = false;

    function type() {
      const phrase = phrases[pi];
      if (!deleting && ci <= phrase.length) {
        typeEl.textContent = phrase.slice(0, ci++);
        setTimeout(type, ci === phrase.length + 1 ? 1800 : 55);
      } else if (!deleting && ci > phrase.length) {
        deleting = true;
        setTimeout(type, 500);
      } else if (deleting && ci >= 0) {
        typeEl.textContent = phrase.slice(0, ci--);
        setTimeout(type, 30);
      } else {
        deleting = false;
        pi = (pi + 1) % phrases.length;
        setTimeout(type, 300);
      }
    }
    setTimeout(type, 2200);
  }

});
