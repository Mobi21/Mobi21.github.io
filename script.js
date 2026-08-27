document.documentElement.classList.add('js');

const header = document.querySelector('[data-header]');
const menuButton = document.querySelector('[data-menu-button]');
const nav = document.querySelector('[data-nav]');

const closeMenu = () => {
  if (!menuButton || !nav) return;
  menuButton.setAttribute('aria-expanded', 'false');
  nav.classList.remove('is-open');
};

menuButton?.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(open));
  nav?.classList.toggle('is-open', open);
});

nav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));

const updateHeader = () => header?.classList.toggle('is-scrolled', window.scrollY > 12);
updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });

document.querySelectorAll('[data-demo]').forEach((demo) => {
  const controls = [...demo.querySelectorAll('[data-demo-target]')];
  const steps = [...demo.querySelectorAll('[data-demo-step]')];

  const activate = (id, focus = false) => {
    controls.forEach((control) => {
      const active = control.dataset.demoTarget === id;
      control.setAttribute('aria-pressed', String(active));
      if (active && focus) control.focus();
    });
    steps.forEach((step) => step.classList.toggle('is-active', step.dataset.demoStep === id));
  };

  controls.forEach((control, index) => {
    control.addEventListener('click', () => activate(control.dataset.demoTarget));
    control.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % controls.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + controls.length) % controls.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = controls.length - 1;
      activate(controls[next].dataset.demoTarget, true);
    });
  });

  if (controls[0]) activate(controls[0].dataset.demoTarget);
});

const year = document.querySelector('[data-year]');
if (year) year.textContent = String(new Date().getFullYear());
