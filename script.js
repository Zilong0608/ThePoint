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

  // 未接 API 的表单不做默认提交(带 data-api / data-live 的表单由 app.js 处理)
  document.querySelectorAll('form:not([data-api]):not([data-live])').forEach(f => f.addEventListener('submit', e => e.preventDefault()));

  /* ===== 首页:开场帷幕 ===== */
  const intro = document.getElementById('intro');
  const goHero = () => document.documentElement.classList.add('hero-go');
  if (intro && intro.style.display !== 'none') {
    const close = () => {
      if (intro.classList.contains('open')) return;
      intro.classList.add('open');
      document.documentElement.classList.remove('intro-lock');
      setTimeout(goHero, 380);
      setTimeout(() => intro.remove(), 1300);
    };
    setTimeout(close, 3300);          // 自动开幕
    intro.addEventListener('click', close); // 点击跳过
  } else if (document.querySelector('.hero--dark')) {
    goHero();
  }

  /* ===== 首页:Hero 幻灯轮播(Ken Burns) ===== */
  const slides = document.querySelectorAll('.hero-slide');
  if (slides.length > 1) {
    let cur = 0;
    setInterval(() => {
      slides[cur].classList.remove('on');
      cur = (cur + 1) % slides.length;
      slides[cur].classList.add('on');
    }, 7200);
  }

  /* ===== 数字滚动 ===== */
  const nums = document.querySelectorAll('.num[data-count]');
  if (nums.length) {
    const ioN = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        ioN.unobserve(en.target);
        const el = en.target;
        const target = parseFloat(el.dataset.count);
        const pre = el.dataset.prefix || '', suf = el.dataset.suffix || '';
        const dec = (el.dataset.count.split('.')[1] || '').length;
        const t0 = performance.now(), dur = 1700;
        const tick = now => {
          const p = Math.min(1, (now - t0) / dur);
          const v = (target * (1 - Math.pow(1 - p, 3))).toFixed(dec);
          el.textContent = pre + v + suf;
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.4 });
    nums.forEach(n => ioN.observe(n));
  }
});
