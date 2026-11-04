import '@testing-library/jest-dom/vitest'

// Autosaves go to localStorage; each test starts from a clean slate.
afterEach(() => window.localStorage.clear())
