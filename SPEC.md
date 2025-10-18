# Functional

Show Jujutsu change DAGs

Drag files out of nodes to split or into other nodes to move the changes

Drag connectors to rebase

Drag nodes to re-order

Show node evologs and allow to split there

When clicking on changes show the changed files in a panel. Show the evolog below the files.

When clicking on a file in the file list, show the diff in a third panel to the right.

File dragging: if I start dragging a file I want all _other_ changes to highlight as a drop target.  furthermore I want additional drop targets to appear on links between changes, as well as branch out to the right from each change as a new leaf.

# Architectural

- Use command-events and a reducer or a store like zustand.
- The command layer is _intention_ based, framed in the context of our UIs. Like "move file".

# Unspecced functionality currently in code

- Parallel stacks (diamond patterns where multiple branches share same parent/child) get visually grouped with purple borders --- Decision: rejected. The purple borders are something someone added but are irrelevant. Please remove them.
- Drop targets support 5 target types --- Decision: More clarity needed. Current behavior:
  - `after`: Places new commit as child of target (uses `jj --insert-after`)
  - `before`: Places new commit as parent of target (uses `jj --insert-before`)
  - `existing-commit`: Moves files into existing commit (uses `jj --into`)
  - `new-branch`: Creates branching point from target (uses `jj --destination`)
  - `new-commit-between`: Places between two specific commits (uses both `--insert-after` and `--insert-before`)
- Evolog panel shows operation metadata (operation ID and description) beyond just the commit history
- Arrow placeholders between stack levels show split/merge indicators
