const P = {
  today: '<path d="M5 12h14M7 8v8M17 8v8M3.5 10v4M20.5 10v4"/>',
  routines: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  history: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  progress: '<path d="M4 19V5M4 19h16M8 15l4-4 3 3 5-6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  chev: '<path d="M9 6l6 6-6 6"/>', back: '<path d="M15 6l-6 6 6 6"/>', down: '<path d="M6 9l6 6 6-6"/>', up: '<path d="M6 15l6-6 6 6"/>',
  list: '<path d="M5 7h14M5 12h14M5 17h14"/>', plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  swap: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  play: '<path d="M8 5l11 7-11 7z" fill="currentColor"/>', pause: '<path d="M9 5v14M15 5v14"/>',
  reset: '<path d="M4 12a8 8 0 1 0 3-6.3M4 4v4h4"/>', skip: '<path d="M6 5l9 7-9 7zM18 5v14"/>',
};
export const icon = (n) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;
