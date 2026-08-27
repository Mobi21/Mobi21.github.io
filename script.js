const header = document.querySelector('[data-header]');
const menuButton = document.querySelector('[data-menu-button]');
const nav = document.querySelector('[data-nav]');
const navLinks = [...document.querySelectorAll('.primary-nav a[href^="#"]')];
const sections = navLinks.map((link) => document.querySelector(link.getAttribute('href'))).filter(Boolean);
const closeMenu = () => {
  if (!menuButton || !nav) return;
  menuButton.setAttribute('aria-expanded', 'false');
  nav.classList.remove('is-open');
};
menuButton?.addEventListener('click', () => {
  const willOpen = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(willOpen));
  nav?.classList.toggle('is-open', willOpen);
});
navLinks.forEach((link) => link.addEventListener('click', closeMenu));
const updateHeader = () => header?.classList.toggle('is-scrolled', window.scrollY > 12);
updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });
if ('IntersectionObserver' in window) {
  const sectionObserver = new IntersectionObserver((entries) => {
    const current = entries.find((entry) => entry.isIntersecting);
    if (!current) return;
    navLinks.forEach((link) => {
      const active = link.getAttribute('href') === `#${current.target.id}`;
      if (active) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  }, { rootMargin: '-25% 0px -65%', threshold: 0 });
  sections.forEach((section) => sectionObserver.observe(section));
}
const year = document.querySelector('[data-year]');
if (year) year.textContent = String(new Date().getFullYear());
