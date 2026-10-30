(function () {
  var STORAGE_KEY = 'busna-lang';

  function apply(lang) {
    var isArabic = lang !== 'en';
    document.documentElement.lang = isArabic ? 'ar' : 'en';
    document.documentElement.dir = isArabic ? 'rtl' : 'ltr';

    document.querySelectorAll('.lang-ar').forEach(function (node) {
      node.hidden = !isArabic;
    });
    document.querySelectorAll('.lang-en').forEach(function (node) {
      node.hidden = isArabic;
    });
    document.querySelectorAll('[data-lang-btn]').forEach(function (button) {
      button.classList.toggle('is-active', button.dataset.langBtn === (isArabic ? 'ar' : 'en'));
    });

    try {
      localStorage.setItem(STORAGE_KEY, isArabic ? 'ar' : 'en');
    } catch (error) {
      // Private browsing may block storage; the page still works.
    }
  }

  var saved = 'ar';
  try {
    saved = localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'ar';
  } catch (error) {
    saved = 'ar';
  }

  try {
    var queryLang = new URLSearchParams(window.location.search).get('lang');
    if (queryLang === 'ar' || queryLang === 'en') saved = queryLang;
  } catch (error) {
    // Ignore malformed URLs.
  }

  apply(saved);

  document.querySelectorAll('[data-lang-btn]').forEach(function (button) {
    button.addEventListener('click', function () {
      apply(button.dataset.langBtn);
    });
  });

  document.querySelectorAll('[data-year]').forEach(function (node) {
    node.textContent = String(new Date().getFullYear());
  });
})();
