(() => {
  // Banner ads for the whole site (Nanpure pages and Pareasobi pages).
  // Set the issued display ad unit ID only after site approval and review of Auto ads and consent settings.
  const slot = '';
  if (!/^\d+$/.test(slot) || location.origin !== 'https://atugari.github.io') return;
  if (document.querySelector('.guide-banner')) return;

  // Guide: keep the existing placement between section 3 and section 4.
  // Other pages: show the banner just before the site footer.
  // Pages without a footer (players and share pages): show it at the end of <main>.
  // Game pages without a footer or <main>: show it at the end of <body>.
  const nextSection = document.querySelector('main.guide-main article > #section-3 + #section-4');
  const footer = document.querySelector('body > footer') || document.querySelector('footer');
  const main = document.querySelector('main');
  const target = nextSection || footer || main || document.body;
  if (!target) return;

  const client = 'ca-pub-5560584474086870';
  if (!document.querySelector('style[data-nanpure-banner]')) {
    const style = document.createElement('style');
    style.setAttribute('data-nanpure-banner', '');
    style.textContent = '.guide-banner{margin:0 0 2rem;text-align:center;color:var(--muted)}.guide-banner small{display:block;margin-bottom:.4rem}.guide-banner:has(>ins[data-ad-status="unfilled"]){display:none}@media print{.guide-banner{display:none}}';
    document.head.append(style);
  }
  const banner = document.createElement('aside');
  banner.className = 'guide-banner';
  banner.setAttribute('aria-label', '広告');
  const label = document.createElement('small');
  label.textContent = '広告';
  const unit = document.createElement('ins');
  unit.className = 'adsbygoogle';
  unit.style.display = 'block';
  unit.dataset.adClient = client;
  unit.dataset.adSlot = slot;
  unit.dataset.adFormat = 'horizontal';
  unit.dataset.fullWidthResponsive = 'false';
  banner.append(label, unit);
  if (target === main || target === document.body) target.append(banner);
  else target.before(banner);
  // A fixed full-screen game has no scrollable flow, so a banner appended
  // to <body> lands above the game instead of below it. There is no good
  // place for it there without covering the game, so do not show it.
  if (target === document.body && banner.getBoundingClientRect().top < 80 && document.body.scrollHeight <= window.innerHeight + 1) {
    banner.remove();
    return;
  }

  // The AdSense verification script may already be in <head>; do not load
  // the library twice.
  if (!document.querySelector('script[src*="adsbygoogle.js"]')) {
    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + client;
    script.addEventListener('error', () => banner.remove());
    document.head.append(script);
  }
  (window.adsbygoogle = window.adsbygoogle || []).push({});
})();
