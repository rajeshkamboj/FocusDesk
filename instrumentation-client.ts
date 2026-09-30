try {
  let theme: string | null = null;

  try {
    theme = localStorage.getItem('pace.theme');
  } catch {}

  if (!theme) {
    try {
      const data = JSON.parse(localStorage.getItem('pace.db.v1') || '{}');
      theme = data?.settings?.appearance?.theme ?? null;
    } catch {}
  }

  const dark =
    theme === 'dark' ||
    ((!theme || theme === 'system') &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
} catch {
  document.documentElement.setAttribute('data-theme', 'light');
}
