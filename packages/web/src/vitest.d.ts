/// <reference types="@testing-library/jest-dom" />

// Teaches tsc about the jest-dom matchers (`toBeChecked`, `toBeInTheDocument`).
// The runtime side is registered in test/setup.ts; this is only the types.
//
// It lives under src/ because the package's tsconfig includes src/ alone, and
// the test files sit beside the code they cover.
