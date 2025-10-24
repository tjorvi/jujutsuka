# Intention-Based Commands

This document describes the new intention-based command layer that abstracts away low-level git operations in favor of higher-level UI intentions.

## Command Philosophy

Instead of thinking in terms of git operations like "rebase" or "squash", the command layer is now framed in the context of our UI interactions:

- **Drag files out of nodes** → Split File From Change
- **Drag files into other nodes** → Move File To Change  
- **Drag connectors** → Rebase Change
- **Drag nodes to re-order** → Reorder Change
- **Split at evolog entries** → Split At Evolog

## Available Commands

### File Manipulation

#### Move File To Change
Move a specific file from one change to another existing change.
```typescript
{
  type: 'move-file-to-change',
  file: FileChange,
  sourceChangeId: CommitId,
  targetChangeId: CommitId
}
```

#### Split File From Change
Extract a specific file from a change into a new change.
```typescript
{
  type: 'split-file-from-change',
  file: FileChange,
  sourceChangeId: CommitId,
  target: CommandTarget // Where to put the new change
}
```

### Change Manipulation

#### Rebase Change
Move a change to a new parent in the DAG (drag connectors).
```typescript
{
  type: 'rebase-change',
  changeId: CommitId,
  newParent: CommandTarget
}
```

#### Reorder Change
Reorder a change to a new position (drag nodes).
```typescript
{
  type: 'reorder-change',
  changeId: CommitId,
  newPosition: CommandTarget
}
```

#### Squash Change Into
Combine one change into another.
```typescript
{
  type: 'squash-change-into',
  sourceChangeId: CommitId,
  targetChangeId: CommitId
}
```

### Evolog Operations

#### Split At Evolog
Split a change at a specific evolog entry.
```typescript
{
  type: 'split-at-evolog',
  changeId: CommitId,
  entryCommitId: CommitId
}
```

### Change Creation

#### Create New Change
Create a completely new change with specified files.
```typescript
{
  type: 'create-new-change',
  files: FileChange[],
  parent: CommandTarget
}
```

## Usage in Components

### Store Methods

The graphStore now provides intention-based methods:

```typescript
const { 
  moveFileToChange,
  splitFileFromChange,
  rebaseChange,
  reorderChange,
  squashChangeInto,
  splitAtEvoLog,
  createNewChange
} = useGraphStore();

// Example: Move a file from one change to another
await moveFileToChange(fileChange, sourceCommitId, targetCommitId);

// Example: Rebase a change to a new parent
await rebaseChange(commitId, { type: 'after', commitId: newParentId });
```

### Legacy Compatibility

The old low-level commands are still supported for backwards compatibility:

```typescript
const { executeRebase, executeSquash, executeSplit, executeMoveFiles } = useGraphStore();
```

## Implementation Notes

- Intention commands are translated to appropriate low-level git operations on the backend
- The backend uses a `parseCommandTarget` helper to handle CommandTarget variations
- Commands are validated using Zod schemas on both intention and legacy formats
- Error handling provides clear feedback about which intention failed and why

## Future Extensions

- **Bulk operations**: Move multiple files at once
- **Conditional splits**: Split based on file patterns or hunks
- **Smart reordering**: Automatically resolve conflicts when reordering
- **Evolog integration**: Full evolog-based splitting and restoration
