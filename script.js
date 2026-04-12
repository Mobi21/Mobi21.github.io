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
})();
