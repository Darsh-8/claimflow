export const Constants = {
  DEFAULT_PAGE_LIMIT: 50,
  API_BASE_URL: import.meta.env.VITE_API_URL || "http://localhost:8000",
} as const;
