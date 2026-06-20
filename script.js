/* THE POINT 一点 — shared interactions (shell only) */
document.addEventListener('DOMContentLoaded', function () {

  // sticky header state
  const header = document.querySelector('.site-header');
  const onScroll = () => header && header.classList.toggle('scrolled', window.scrollY > 40);
  window.addEventListener('scroll', onScroll); onScroll();

  // mobile drawer
  const burger = document.querySelector('.burger');
  const drawer = document.querySelector('.mobile-nav');
  const closeBtn = document.querySelector('.mobile-nav .close');
  if (burger && drawer) {
    burger.addEventListener('click', () => drawer.classList.add('open'));
    closeBtn && closeBtn.addEventListener('click', () => drawer.classList.remove('open'));
    drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', () => drawer.classList.remove('open')));
  }

  // scroll reveal
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  // prevent default on shell links/forms (no backend yet)
  document.querySelectorAll('form').forEach(f => f.addEventListener('submit', e => e.preventDefault()));
});
