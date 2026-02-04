function init() {
  let theme = localStorage.getItem('trailence-doc.theme');
  if (!theme) theme = (globalThis.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  setTheme(theme);
  displayForLang();
  showMenu(window.innerWidth >= 900, true);
  highlightCurrentMenu();
  if (window.innerWidth >= 900)
    document.querySelector('div.site-menu.home-menu')?.remove();
}

function setTheme(theme) {
  document.body.classList.remove('dark-theme', 'light-theme');
  document.body.classList.add(theme + '-theme');
  localStorage.setItem('trailence-doc.theme', theme);
}

function displayForLang() {
  const lang = document.documentElement.lang;
  const elements = document.querySelectorAll('.if-not-lang');
  for (let i = 0; i < elements.length; ++i) {
    const element = elements.item(i);
    if (!element.classList.contains('lang-' + lang)) element.style.display = 'inherit';
  }
}

function showMenu(shown, first) {
  globalThis.menuShown = shown;
  const menu = document.querySelector('div.site-menu:not(.home-menu)');
  if (shown) menu.classList.add('shown');
  else menu.classList.remove('shown');
  if (first) setTimeout(function() {
    menu.style.transition = 'width 0.3s ease-in-out, left 0.3s ease-in-out';
  }, 0);
}

function highlightCurrentMenu() {
  const links = document.querySelectorAll('div.site-menu a');
  let pageName = globalThis.location.pathname;
  if (pageName.startsWith('/')) pageName = pageName.substring(1);
  let i = pageName.indexOf('/'); // lang
  pageName = pageName.substring(i + 1);
  links.forEach(link => {
    let target = '' + link.href;
    if (target.endsWith('/' + pageName)) link.classList.add('selected');
  });
}
