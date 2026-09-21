export const ChapterStatus = {
  TOC_ONLY: 'TOC_ONLY',
  FETCHING: 'FETCHING',
  FETCHED: 'FETCHED',
  TRANSLATING: 'TRANSLATING',
  TRANSLATED_GT: 'TRANSLATED_GT',
  POLISH_QUEUED: 'POLISH_QUEUED',
  POLISHING: 'POLISHING',
  POLISHED: 'POLISHED',
  FETCH_FAILED: 'FETCH_FAILED',
  TRANSLATE_FAILED: 'TRANSLATE_FAILED',
  POLISH_FAILED: 'POLISH_FAILED',
} as const;
export type ChapterStatus = typeof ChapterStatus[keyof typeof ChapterStatus];

export const JobType = {
  FETCH_AND_TRANSLATE: 'FETCH_AND_TRANSLATE',
  POLISH: 'POLISH',
} as const;
export type JobType = typeof JobType[keyof typeof JobType];

export const JobStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export type JobStatus = typeof JobStatus[keyof typeof JobStatus];

export const ErrorCode = {
  NONE: 'NONE',
  SOURCE_TIMEOUT: 'SOURCE_TIMEOUT',
  SOURCE_403_FORBIDDEN: 'SOURCE_403_FORBIDDEN',
  SOURCE_429_RATE_LIMIT: 'SOURCE_429_RATE_LIMIT',
  SOURCE_BLOCKED_OR_CHALLENGE: 'SOURCE_BLOCKED_OR_CHALLENGE',
  SOURCE_PARSE_ERROR: 'SOURCE_PARSE_ERROR',
  TRANSLATION_TIMEOUT: 'TRANSLATION_TIMEOUT',
  TRANSLATION_API_ERROR: 'TRANSLATION_API_ERROR',
  LLM_TIMEOUT: 'LLM_TIMEOUT',
  LLM_INVALID_SCHEMA: 'LLM_INVALID_SCHEMA',
  DB_LOCK_TIMEOUT: 'DB_LOCK_TIMEOUT',
  WORKER_CRASHED_OR_TIMED_OUT: 'WORKER_CRASHED_OR_TIMED_OUT',
} as const;
export type ErrorCode = typeof ErrorCode[keyof typeof ErrorCode];

export const EntityType = {
  CHARACTER: 'CHARACTER',
  LOCATION: 'LOCATION',
  ORGANIZATION: 'ORGANIZATION',
  ITEM: 'ITEM',
  SKILL: 'SKILL',
  CUSTOM: 'CUSTOM',
} as const;
export type EntityType = typeof EntityType[keyof typeof EntityType];

export const ValidationStatus = {
  PENDING: 'PENDING',
  AUTO_APPROVED: 'AUTO_APPROVED',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  REJECTED: 'REJECTED',
} as const;
export type ValidationStatus = typeof ValidationStatus[keyof typeof ValidationStatus];
