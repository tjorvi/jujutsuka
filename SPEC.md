# Functional

Show Jujutsu change DAGs

Drag files out of nodes to split or into other nodes to move the changes

Drag connectors to rebase

Drag nodes to re-order

Show node evologs and allow to split there

When clicking on changes show the changed files in a panel. Show the evolog below the files.
File dragging: if I start dragging a file I want all _other_ changes to highlight as a drop target.  furthermore I want additional drop targets to appear on links between changes, as well as branch out to the right from each change as a new leaf.

# Architectural

- Use command-events and a reducer or a store like zustand.

- The events should be 2 layered.
  - First layer is _intention_ based, framed in the context of our UIs. Like "move file".
  - This layer then gets translated in to JJ layer which is based on jj-like command events like Split, Squash, etc.
  - Each intention command can translate to one or more JJ commands.
