(() => {
  // Set the issued display ad unit ID only after site approval and review of Auto ads and consent settings.
  const slot = '';
  if (!/^\d+$/.test(slot) || location.origin !== 'https://atugari.github.io') return;

  const nextSection = document.querySelector('main.guide-main article > #section-3 + #section-4');
  if (!nextSection) return;
  const client = 'ca-pub-5560584474086870';
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
  nextSection.before(banner);

  const script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + client;
  script.addEventListener('error', () => banner.remove());
  document.head.append(script);
  (window.adsbygoogle = window.adsbygoogle || []).push({});
})();
