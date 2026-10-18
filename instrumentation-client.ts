import { applyTheme, readStoredTheme } from './lib/theme';

// Run before hydration, including on authentication screens.
applyTheme(readStoredTheme());
