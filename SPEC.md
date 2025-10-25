# Functional

Show Jujutsu change DAGs

Drag files out of nodes to split or into other nodes to move the changes

Drag connectors to rebase

Drag nodes to re-order

Show node evologs and allow to split there

Show repository bookmarks directly on commit cards so users can see named anchors.

When clicking on changes show the changed files in a panel. Show the evolog below the files.

When clicking on a file in the file list, show the diff in a third panel to the right.

When clicking on changes, show AI-generated summaries of diffs per file in the file list panel. Users can configure their OpenAI API key in settings to enable this feature.

Let people edit change descriptions directly from the modified files panel.

File dragging: if I start dragging a file I want all _other_ changes to highlight as a drop target.  furthermore I want additional drop targets to appear on links between changes, as well as branch out to the right from each change as a new leaf.

Highlight commits that are in conflict and surface that status in the graph UI.

# Architectural

- Use command-events and a reducer or a store like zustand.
- The command layer is _intention_ based, framed in the context of our UIs. Like "move file".

# Visual Indicators

- **Commit size indicators**: Visual badges (XS/S/M/L/XL) with color coding (gray → blue → yellow → orange → red) showing relative change size. Tooltips show "+additions -deletions" counts.
- **Empty commit state**: Commits with no changes and no description show dashed borders instead of solid borders.
- **File status badges**: Icons and colored badges for file changes:
  - M (Modified): 📝 amber
  - A (Added): ➕ green
  - D (Deleted): ❌ red
  - R (Renamed): 🔄 purple
  - C (Copied): 📋 cyan
- **File size indicators**: Visual bar chart in file list showing proportional additions (green) vs deletions (red), 1-5 bars based on total changes.
- **Current commit badge**: Green "CURRENT" badge on the commit that is checked out in the workspace.

# Drag and Drop Operations

## Drop Zone Types
Drop targets support 5 target types:
- `after`: Places new commit as child of target (uses `jj --insert-after`)
- `before`: Places new commit as parent of target (uses `jj --insert-before`)
- `existing`: Moves files into existing commit (uses `jj --into`)
- `new-branch`: Creates branching point from target (uses `jj --destination`)
- `between`: Places between two specific commits (uses both `--insert-after` and `--insert-before`)

## Drop Zone UI
- **Linear drop zones**: Inter-change drop zones appear between commits when dragging
- **Branch drop zones**: New-branch drop zones positioned to the right of each commit
- **"New change" buttons**: Quick action buttons appear on drop zones to create empty commits at that position
- **Drop zone visibility**: Controlled by global drag state - drop zones only visible when something is being dragged
- **Highlighting**: Drop zones highlight when hovered during drag

## Drag Operations
- **File dragging**: Drag files from file list to move them between commits or create new commits
- **Commit dragging**: Drag entire commits to reorder/rebase them
- **Commit drop modes**:
  - Default: Rebase (repositions commit)
  - Drop on unselected card: Squash (merge commits)
- **Global drag state**: Document-level tracking prevents false drag-leave triggers

# Operation Log Panel

- **Operation Log View**: Toggle-able panel showing chronological timeline of all jujutsu operations
- **Operation types with color coding**:
  - Regular operations: White background
  - Undo operations: Yellow (#fef3c7) with ↶ icon
  - Redo operations: Blue (#dbeafe) with ↷ icon
  - Snapshots: Gray (#f3f4f6) with 📸 icon, 0.6 opacity
- **Snapshot grouping**: Consecutive snapshots can be collapsed as a single group
- **Operation details**: Shows operation ID (shortened), timestamp (humanized: "just now", "5m ago", etc.), description, and user
- **Undo/Redo buttons**: Header buttons to undo last operation or redo last undone operation

# Evolution Log Features

- **Evolution log preview mode**: Click on past entries in the evolog to preview that version of the commit
- **Preview warning banner**: When viewing an older version, yellow warning banner shows which version is active with "Back to latest" button
- **Split at evolog entry**: "Split here" button on past entries to resurrect that historical version as a new commit
- **Conflict handling**: When a split resurrects an older version, the new commit auto-resolves by accepting the resurrected content so both resulting commits land conflict-free
- **Entry metadata**: Each evolog entry shows operation ID and description that created that version
- **Current/previewing badges**: Visual indication of which version is latest vs which is being previewed

# Commit Operations

- **Checkout operation**: "Check out" button on each commit card to switch working directory to that commit. Button shows "Checked out" when that commit is current.
- **Abandon operation**: "Abandon" button to safely remove commits from stack (soft delete via `jj abandon`)
- **Description editing**: Edit commit messages inline from the modified files panel with save/cancel buttons
- **Create empty change**: Buttons on drop zones to create empty commits at specific positions in the stack

# Settings Panel

- **Settings modal**: Accessible via settings button in header
- **OpenAI API key configuration**: Password field for API key with show/hide toggle. Warning that key is stored locally in browser.
- **Model selector**: Dropdown to choose from multiple OpenAI models:
  - Recommended: gpt-5-nano, gpt-5-mini, gpt-5
  - Advanced: gpt-4.1, gpt-4o-mini, gpt-4o
  - Reasoning: o3, o4-mini
  - Legacy: gpt-4-turbo, gpt-4, gpt-3.5-turbo

# Diff Panel Features

- **Unified diff view**: When no specific file is selected, show all changed files in a single unified view
- **Parallel loading**: All file diffs load in parallel for performance
- **Dark theme**: Code diffs shown with dark background (#1e1e1e) for better readability
- **Syntax highlighting**:
  - Added lines: Green (#22c55e) on dark green background
  - Removed lines: Red (#ef4444) on dark red background
  - Hunk headers (@@): Blue on dark blue background

# Connection Indicators

- **Arrow placeholders between stack levels** show split/merge indicators:
  - Linear connections: Simple up arrow (↑)
  - Split patterns: "Split (N)" label showing how many branches split from one stack
  - Merge patterns: "Merge (N)" label showing how many branches merge into one stack

# Unspecced functionality currently in code
- **Parallel groups**: Diamond patterns where multiple branches share same parent/child get visually marked with `data-parallel="true"` attribute. *(Note: Purple border styling exists but decision is to remove it - it's irrelevant.)*

*(This section intentionally kept for tracking new features as they're added)*
