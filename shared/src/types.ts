// Shared types between frontend and backend
// These types have NO runtime dependencies on Node.js

// Branded string types for type safety
declare const CommitIdBrand: unique symbol;
declare const ChangeIdBrand: unique symbol;
declare const EmailBrand: unique symbol;
declare const DescriptionBrand: unique symbol;
declare const BookmarkNameBrand: unique symbol;

export type CommitId = string & { readonly [CommitIdBrand]: true };
export type ChangeId = string & { readonly [ChangeIdBrand]: true };
export type Email = string & { readonly [EmailBrand]: true };
export type Description = string & { readonly [DescriptionBrand]: true };
export type BookmarkName = string & { readonly [BookmarkNameBrand]: true };

// Transform functions to create branded types
export function createCommitId(value: string): CommitId {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Empty commit ID`);
  }
  if (trimmed.length !== 40) {
    throw new Error(`Invalid commit ID: ${value} (length: ${trimmed.length}, expected 40)`);
  }
  return trimmed as CommitId;
}

export function createChangeId(value: string): ChangeId {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Empty change ID`);
  }
  // Change IDs are typically shorter than commit IDs in jj (usually 12 chars by default)
  if (trimmed.length < 8) {
    throw new Error(`Invalid change ID: ${value} (length: ${trimmed.length}, expected at least 8)`);
  }
  return trimmed as ChangeId;
}

export function createEmail(value: string): Email {
  const trimmed = value.trim();
  if (!trimmed || !trimmed.includes('@')) {
    throw new Error(`Invalid email: ${value}`);
  }
  return trimmed as Email;
}

export function createDescription(value: string): Description {
  const trimmed = value.trim();
  if (!trimmed) {
    return '(no description)' as Description;
  }
  return trimmed as Description;
}

export function createBookmarkName(value: string): BookmarkName {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Invalid bookmark name: "${value}"`);
  }
  return trimmed as BookmarkName;
}

export interface Commit {
  id: CommitId;
  changeId: ChangeId;
  description: Description;
  author: {
    name: string;
    email: Email;
    timestamp: Date;
  };
  parents: CommitId[];
  bookmarks: readonly BookmarkName[];
}

export interface FileChange {
  path: string;
  status: 'M' | 'A' | 'D' | 'R' | 'C'; // Modified, Added, Deleted, Renamed, Copied
  additions?: number;
  deletions?: number;
}

export interface OpLogEntry {
  id: string;
  timestamp: Date;
  description: string;
}

export interface Bookmark {
  name: BookmarkName;
  commitId: CommitId;
}

// Position type for command targeting
export type Position =
  | { kind: 'before'; commit: CommitId }
  | { kind: 'after'; commit: CommitId }
  | { kind: 'between-commits'; beforeCommit: CommitId; afterCommit: CommitId }
  | { kind: 'new-branch'; commit: CommitId }
  | { kind: 'existing-commit'; commit: CommitId };

// CommandTarget is an alias for Position (for backwards compatibility)
export type CommandTarget = Position;
