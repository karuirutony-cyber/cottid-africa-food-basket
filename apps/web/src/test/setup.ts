import '@testing-library/jest-dom/vitest';

// jsdom has no layout; ScrollRestoration calls scrollTo.
window.scrollTo = () => {};
