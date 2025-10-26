# jjka - Jujutsu Utilities CLI

A command-line tool providing additional utilities for working with [Jujutsu](https://github.com/jj-vcs/jj) repositories.

## Features

### `hunksplit` - Split commits by line ranges

The `hunksplit` command allows you to split commits by specifying exact line ranges, similar to `jj split -i` but with more precise control over which lines to include.

## Installation

### Prerequisites

- Rust toolchain (1.90.0 or later)
- [mise](https://mise.jdx.dev/) (for development)
- A Jujutsu repository

### Build from source

```bash
cd cli
mise exec -- cargo build --release
```

The binary will be available at `./target/release/jjka`

### Install globally

```bash
mise exec -- cargo install --path .
```

## Usage

### `hunksplit` - Split by line ranges

Split commits by specifying exact line ranges to extract into a new commit.

#### Syntax

```bash
jjka hunksplit [OPTIONS] <RANGES>...
```

#### Arguments

- `<RANGES>...` - One or more line ranges in the format `path:start-end`
  - `path` - File path relative to repository root
  - `start` - Starting line number (1-indexed, inclusive)
  - `end` - Ending line number (1-indexed, inclusive)

#### Options

- `-r, --revision <REVISION>` - The revision to split (defaults to `@`, the working copy)
- `-m, --message <MESSAGE>` - Message for the new commit (with selected changes)
- `-h, --help` - Print help information

#### Examples

##### Split a single file range

Extract lines 10-20 from `src/main.rs`:

```bash
jjka hunksplit src/main.rs:10-20
```

##### Split multiple ranges

Extract lines from multiple files:

```bash
jjka hunksplit src/main.rs:10-20 src/lib.rs:5-15
```

##### Split from a specific revision

Split lines from the parent commit:

```bash
jjka hunksplit --revision @- src/main.rs:10-20
```

##### Add a custom commit message

```bash
jjka hunksplit -m "Extract utility functions" src/utils.rs:50-100
```

##### Multiple ranges from the same file

Extract non-contiguous lines from the same file:

```bash
jjka hunksplit src/main.rs:10-20 src/main.rs:50-60
```

#### How it works

When you run `hunksplit`:

1. **Parses line ranges** - Validates and parses your line range specifications
2. **Loads the repository** - Connects to your Jujutsu workspace
3. **Extracts lines** - Reads the files and extracts:
   - **Selected lines** - Lines matching your ranges (for the new commit)
   - **Remaining lines** - Everything else (stays in the original commit)
4. **Shows preview** - Currently displays what would be split (preview mode)

> **Note**: The current version operates in preview mode. It shows what lines would be extracted but doesn't create the actual commits yet. Full commit-creation functionality requires additional jj_lib API integration.

#### Preview mode output

The command currently shows:
- Parsed line ranges
- Affected files
- Line counts for selected and remaining content
- Actual content that would be selected

Example output:

```
Successfully loaded repository

Parsed line ranges:
  src/main.rs lines 10-20

Affected files:
  - src/main.rs
    Selected: 245 bytes (11 lines)
    Remaining: 1854 bytes (89 lines)

    Selected content:
      fn helper_function() {
      ...
      }

Note: This is a preview. Actual commit splitting is not yet implemented.
```

## Development

### Running tests

```bash
# Run all tests
mise exec -- cargo test

# Run only unit tests
mise exec -- cargo test --lib

# Run only integration tests
mise exec -- cargo test --test cli_tests

# Run with output
mise exec -- cargo test -- --nocapture
```

### Test coverage

The project includes 25 tests:
- 15 unit tests for line parsing and extraction logic
- 10 integration tests for CLI behavior

### Project structure

```
cli/
├── src/
│   └── main.rs          # Main CLI implementation
├── tests/
│   └── cli_tests.rs     # Integration tests
├── Cargo.toml           # Dependencies and metadata
└── README.md            # This file
```

## Examples

### Workflow: Extract a function to a separate commit

Suppose you have a commit with mixed changes and want to extract a specific function:

1. **Identify the line range** of the function in the file:
   ```bash
   # View the file with line numbers
   cat -n src/utils.rs | grep -A 20 "fn my_function"
   ```

2. **Run hunksplit** with the range:
   ```bash
   jjka hunksplit -m "Add my_function utility" src/utils.rs:42-65
   ```

3. **Review the preview** to confirm the right lines are selected

### Workflow: Split related changes from multiple files

If you have related changes across multiple files:

```bash
jjka hunksplit \
  -m "Add authentication system" \
  src/auth.rs:1-50 \
  src/models/user.rs:20-45 \
  src/routes/login.rs:10-30
```

## Comparison with `jj split`

| Feature | `jj split -i` | `jjka hunksplit` |
|---------|---------------|------------------|
| Interactive UI | ✅ Yes | ❌ No |
| Exact line ranges | ❌ No | ✅ Yes |
| Hunk-level splitting | ✅ Yes | ⚠️ Preview only |
| Multiple files | ✅ Yes | ✅ Yes |
| Non-contiguous ranges | ⚠️ Limited | ✅ Yes |
| Scriptable | ❌ No | ✅ Yes |

## Roadmap

- [ ] Full commit creation (currently preview-only)
- [ ] Support for `--tool` flag to open in external editor
- [ ] Undo/redo functionality
- [ ] Better conflict handling
- [ ] Support for binary files
- [ ] Interactive mode combining line ranges with TUI

## Contributing

This is a utility tool for Jujutsu. Contributions are welcome!

### Guidelines

1. Write tests for new features
2. Run `cargo fmt` before committing
3. Ensure all tests pass: `cargo test`
4. Update this README for user-facing changes

## License

Same license as the parent project.

## Related

- [Jujutsu VCS](https://github.com/jj-vcs/jj) - The version control system this tool extends
- [jj-lib](https://crates.io/crates/jj-lib) - The library this tool uses
