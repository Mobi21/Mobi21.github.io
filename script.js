/**
 * Portfolio site scripts.
 * Runs after `defer` — DOM is ready when this executes.
 */
(function () {
  'use strict';

  // ========================================================
  // 1. Glass backdrop on scroll
  // ========================================================
  const header = document.getElementById('site-header');
  const SCROLL_THRESHOLD = 16;

  function updateHeaderScrolledState() {
    if (window.scrollY > SCROLL_THRESHOLD) {
      header.classList.add('is-scrolled');
    } else {
      header.classList.remove('is-scrolled');
    }
  }

  updateHeaderScrolledState();
  window.addEventListener('scroll', updateHeaderScrolledState, { passive: true });

  // ========================================================
  // 2. Active section highlighting (Intersection Observer)
  // ========================================================
  const sections = Array.from(document.querySelectorAll('main section[id]'));
  const navLinks = Array.from(document.querySelectorAll('.site-nav__link'));

  function setActiveLink(sectionId) {
    navLinks.forEach((link) => {
      const href = link.getAttribute('href');
      if (href === `#${sectionId}`) {
        link.classList.add('is-active');
      } else {
        link.classList.remove('is-active');
      }
    });
  }

  if (sections.length && navLinks.length && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        // Find the section with the largest visible portion
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) {
          setActiveLink(visible.target.id);
        }
      },
      {
        rootMargin: '-40% 0px -50% 0px',
        threshold: [0, 0.25, 0.5, 0.75, 1],
      }
    );

    sections.forEach((section) => observer.observe(section));
  }

  // ========================================================
  // 3. Mobile drawer with focus trap
  // ========================================================
  const toggleBtn = document.getElementById('menu-toggle');
  const drawer = document.getElementById('mobile-drawer');
  let lastFocusedElement = null;

  function getFocusableElements(container) {
    return Array.from(
      container.querySelectorAll(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
  }

  function openDrawer() {
    lastFocusedElement = document.activeElement;
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    toggleBtn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('has-drawer-open');

    // Focus the first focusable element inside the drawer
    const focusables = getFocusableElements(drawer);
    if (focusables.length) {
      focusables[0].focus();
    }
  }

  function closeDrawer() {
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    toggleBtn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('has-drawer-open');

    // Return focus to the hamburger button
    if (lastFocusedElement) {
      lastFocusedElement.focus();
    } else {
      toggleBtn.focus();
    }
  }

  function toggleDrawer() {
    if (drawer.classList.contains('is-open')) {
      closeDrawer();
    } else {
      openDrawer();
    }
  }

  if (toggleBtn && drawer) {
    toggleBtn.addEventListener('click', toggleDrawer);

    // Close on link click
    drawer.querySelectorAll('.mobile-drawer__link').forEach((link) => {
      link.addEventListener('click', closeDrawer);
    });

    // Close on backdrop click
    drawer.querySelectorAll('[data-drawer-dismiss]').forEach((el) => {
      el.addEventListener('click', closeDrawer);
    });

    // Escape key closes
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('is-open')) {
        closeDrawer();
      }
    });

    // Focus trap: Tab/Shift+Tab cycle within the drawer while open
    drawer.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || !drawer.classList.contains('is-open')) return;
      const focusables = getFocusableElements(drawer);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  }

  // ========================================================
  // 4. Scroll reveal (Intersection Observer, single-fire)
  // ========================================================
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!reduceMotion && 'IntersectionObserver' in window) {
    const revealTargets = document.querySelectorAll(
      '.about, .experience, .projects, .skills, .education, .contact'
    );

    // Add reveal class to each target
    revealTargets.forEach((el) => el.classList.add('reveal'));

    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target); // single-fire
          }
        });
      },
      {
        threshold: 0.12,
        rootMargin: '0px 0px -80px 0px',
      }
    );

    revealTargets.forEach((el) => revealObserver.observe(el));
  }
})();
