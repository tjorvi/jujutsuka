use anyhow::{bail, Context, Result};
use clap::{Parser, Subcommand};
use itertools::Itertools;
use jj_lib::config::StackedConfig;
use jj_lib::repo::StoreFactories;
use jj_lib::settings::UserSettings;
use jj_lib::workspace::{Workspace, default_working_copy_factories};
use std::collections::HashSet;

#[derive(Parser, Debug)]
#[command(name = "jjka", version, about = "Jujutsu utilities", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand, Debug)]
enum Commands {
    /// Split hunks by line ranges
    ///
    /// Examples:
    ///   jjka hunksplit src/main.rs:10-20
    ///   jjka hunksplit src/main.rs:10-20 src/lib.rs:5-15
    ///   jjka hunksplit --revision @- src/main.rs:10-20
    Hunksplit {
        /// Line ranges to include in the new commit (format: path:start-end)
        #[arg(required = true)]
        ranges: Vec<String>,

        /// The revision to split (defaults to @, the working copy)
        #[arg(short = 'r', long, default_value = "@")]
        revision: String,

        /// Message for the new commit (the one with the selected changes)
        #[arg(short = 'm', long)]
        message: Option<String>,
    },
}

#[derive(Debug, Clone)]
struct LineRange {
    path: String,
    start: usize, // 1-indexed, inclusive
    end: usize,   // 1-indexed, inclusive
}

impl LineRange {
    fn parse(s: &str) -> Result<Self> {
        let parts: Vec<&str> = s.rsplitn(2, ':').collect();
        if parts.len() != 2 {
            bail!("Invalid range format. Expected path:start-end, got: {}", s);
        }

        let (range_str, path_str) = (parts[0], parts[1]);
        let range_parts: Vec<&str> = range_str.split('-').collect();
        if range_parts.len() != 2 {
            bail!(
                "Invalid range format. Expected start-end, got: {}",
                range_str
            );
        }

        let start = range_parts[0]
            .parse::<usize>()
            .context("Failed to parse start line number")?;
        let end = range_parts[1]
            .parse::<usize>()
            .context("Failed to parse end line number")?;

        if start < 1 || end < 1 {
            bail!("Line numbers must be >= 1");
        }

        if start > end {
            bail!("Start line must be <= end line");
        }

        Ok(LineRange {
            path: path_str.to_string(),
            start,
            end,
        })
    }
}

fn extract_lines_from_content(content: &[u8], ranges: &[LineRange], file_path: &str) -> Vec<u8> {
    // Find all ranges that apply to this file
    let applicable_ranges: Vec<_> = ranges
        .iter()
        .filter(|r| r.path == file_path)
        .sorted_by_key(|r| r.start)
        .collect();

    if applicable_ranges.is_empty() {
        return Vec::new();
    }

    let content_str = String::from_utf8_lossy(content);
    let lines: Vec<&str> = content_str.lines().collect();
    let mut result_lines = Vec::new();

    for range in applicable_ranges {
        // Convert to 0-indexed
        let start_idx = range.start.saturating_sub(1);
        let end_idx = range.end.min(lines.len());

        if start_idx < lines.len() {
            for line in &lines[start_idx..end_idx] {
                result_lines.push(*line);
            }
        }
    }

    result_lines.join("\n").into_bytes()
}

fn extract_complement_lines(content: &[u8], ranges: &[LineRange], file_path: &str) -> Vec<u8> {
    // Find all ranges that apply to this file
    let applicable_ranges: Vec<_> = ranges
        .iter()
        .filter(|r| r.path == file_path)
        .sorted_by_key(|r| r.start)
        .collect();

    if applicable_ranges.is_empty() {
        return content.to_vec();
    }

    let content_str = String::from_utf8_lossy(content);
    let lines: Vec<&str> = content_str.lines().collect();
    let mut excluded_lines = HashSet::new();

    // Mark all lines that should be excluded
    for range in &applicable_ranges {
        let start_idx = range.start.saturating_sub(1);
        let end_idx = range.end.min(lines.len());

        for i in start_idx..end_idx {
            excluded_lines.insert(i);
        }
    }

    // Collect lines that are not excluded
    let result_lines: Vec<_> = lines
        .iter()
        .enumerate()
        .filter(|(i, _)| !excluded_lines.contains(i))
        .map(|(_, line)| *line)
        .collect();

    result_lines.join("\n").into_bytes()
}

async fn hunksplit_command(
    ranges: Vec<String>,
    _revision: String,
    _message: Option<String>,
) -> Result<()> {
    // Parse line ranges
    let mut parsed_ranges = Vec::new();
    for range_str in &ranges {
        parsed_ranges.push(LineRange::parse(range_str)?);
    }

    // Find the workspace
    let cwd = std::env::current_dir().context("Failed to get current directory")?;

    // Create default user settings with StackedConfig
    let stacked_config = StackedConfig::empty();
    let settings = UserSettings::from_config(stacked_config)?;

    // Load workspace with default factories
    let store_factories = StoreFactories::default();
    let working_copy_factories = default_working_copy_factories();

    let workspace = Workspace::load(&settings, &cwd, &store_factories, &working_copy_factories)
        .context("Failed to load workspace")?;

    let _repo = workspace.repo_loader().load_at_head()
        .context("Failed to load repository")?;

    println!("Successfully loaded repository");
    println!("\nParsed line ranges:");
    for range in &parsed_ranges {
        println!("  {} lines {}-{}", range.path, range.start, range.end);
    }

    // Collect all files mentioned in ranges
    let affected_files: HashSet<_> = parsed_ranges.iter().map(|r| r.path.as_str()).collect();

    println!("\nAffected files:");
    for file_path_str in affected_files {
        println!("  - {}", file_path_str);

        // Try to read the file from the working copy
        let wc_path = workspace.workspace_root().join(file_path_str);
        if let Ok(content) = std::fs::read(&wc_path) {
            let selected_content = extract_lines_from_content(&content, &parsed_ranges, file_path_str);
            let remaining_content = extract_complement_lines(&content, &parsed_ranges, file_path_str);

            println!("    Selected: {} bytes ({} lines)",
                selected_content.len(),
                String::from_utf8_lossy(&selected_content).lines().count()
            );
            println!("    Remaining: {} bytes ({} lines)",
                remaining_content.len(),
                String::from_utf8_lossy(&remaining_content).lines().count()
            );

            println!("\n    Selected content:");
            for line in String::from_utf8_lossy(&selected_content).lines() {
                println!("      {}", line);
            }
        } else {
            println!("    (file not found in working copy)");
        }
    }

    println!("\nNote: This is a preview. Actual commit splitting is not yet implemented.");
    println!("The jj_lib API for commit creation needs to be properly integrated.");

    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Hunksplit {
            ranges,
            revision,
            message,
        } => hunksplit_command(ranges, revision, message).await?,
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_line_range_parse_valid() {
        let range = LineRange::parse("src/main.rs:10-20").unwrap();
        assert_eq!(range.path, "src/main.rs");
        assert_eq!(range.start, 10);
        assert_eq!(range.end, 20);
    }

    #[test]
    fn test_line_range_parse_with_colons_in_path() {
        let range = LineRange::parse("C:/Users/test/file.rs:5-15").unwrap();
        assert_eq!(range.path, "C:/Users/test/file.rs");
        assert_eq!(range.start, 5);
        assert_eq!(range.end, 15);
    }

    #[test]
    fn test_line_range_parse_single_line() {
        let range = LineRange::parse("test.txt:42-42").unwrap();
        assert_eq!(range.path, "test.txt");
        assert_eq!(range.start, 42);
        assert_eq!(range.end, 42);
    }

    #[test]
    fn test_line_range_parse_invalid_format() {
        assert!(LineRange::parse("src/main.rs").is_err());
        assert!(LineRange::parse("src/main.rs:10").is_err());
        assert!(LineRange::parse("src/main.rs:10-20-30").is_err());
    }

    #[test]
    fn test_line_range_parse_invalid_numbers() {
        assert!(LineRange::parse("src/main.rs:abc-def").is_err());
        assert!(LineRange::parse("src/main.rs:10-abc").is_err());
        assert!(LineRange::parse("src/main.rs:0-10").is_err());
    }

    #[test]
    fn test_line_range_parse_inverted_range() {
        assert!(LineRange::parse("src/main.rs:20-10").is_err());
    }

    #[test]
    fn test_extract_lines_simple() {
        let content = b"line 1\nline 2\nline 3\nline 4\nline 5";
        let ranges = vec![LineRange {
            path: "test.txt".to_string(),
            start: 2,
            end: 4,
        }];

        let result = extract_lines_from_content(content, &ranges, "test.txt");
        let result_str = String::from_utf8(result).unwrap();

        assert_eq!(result_str, "line 2\nline 3\nline 4");
    }

    #[test]
    fn test_extract_lines_multiple_ranges() {
        let content = b"line 1\nline 2\nline 3\nline 4\nline 5\nline 6";
        let ranges = vec![
            LineRange {
                path: "test.txt".to_string(),
                start: 1,
                end: 2,
            },
            LineRange {
                path: "test.txt".to_string(),
                start: 5,
                end: 6,
            },
        ];

        let result = extract_lines_from_content(content, &ranges, "test.txt");
        let result_str = String::from_utf8(result).unwrap();

        assert_eq!(result_str, "line 1\nline 2\nline 5\nline 6");
    }

    #[test]
    fn test_extract_lines_no_matching_file() {
        let content = b"line 1\nline 2\nline 3";
        let ranges = vec![LineRange {
            path: "other.txt".to_string(),
            start: 1,
            end: 2,
        }];

        let result = extract_lines_from_content(content, &ranges, "test.txt");

        assert_eq!(result.len(), 0);
    }

    #[test]
    fn test_extract_lines_out_of_bounds() {
        let content = b"line 1\nline 2\nline 3";
        let ranges = vec![LineRange {
            path: "test.txt".to_string(),
            start: 2,
            end: 10,
        }];

        let result = extract_lines_from_content(content, &ranges, "test.txt");
        let result_str = String::from_utf8(result).unwrap();

        // Should only get lines 2-3 (not fail on out of bounds)
        assert_eq!(result_str, "line 2\nline 3");
    }

    #[test]
    fn test_extract_complement_lines_simple() {
        let content = b"line 1\nline 2\nline 3\nline 4\nline 5";
        let ranges = vec![LineRange {
            path: "test.txt".to_string(),
            start: 2,
            end: 4,
        }];

        let result = extract_complement_lines(content, &ranges, "test.txt");
        let result_str = String::from_utf8(result).unwrap();

        assert_eq!(result_str, "line 1\nline 5");
    }

    #[test]
    fn test_extract_complement_lines_multiple_ranges() {
        let content = b"line 1\nline 2\nline 3\nline 4\nline 5\nline 6";
        let ranges = vec![
            LineRange {
                path: "test.txt".to_string(),
                start: 2,
                end: 3,
            },
            LineRange {
                path: "test.txt".to_string(),
                start: 5,
                end: 5,
            },
        ];

        let result = extract_complement_lines(content, &ranges, "test.txt");
        let result_str = String::from_utf8(result).unwrap();

        assert_eq!(result_str, "line 1\nline 4\nline 6");
    }

    #[test]
    fn test_extract_complement_lines_no_matching_file() {
        let content = b"line 1\nline 2\nline 3";
        let ranges = vec![LineRange {
            path: "other.txt".to_string(),
            start: 1,
            end: 2,
        }];

        let result = extract_complement_lines(content, &ranges, "test.txt");

        // Should return all content since no ranges apply to this file
        assert_eq!(result, content);
    }

    #[test]
    fn test_extract_complement_all_lines_selected() {
        let content = b"line 1\nline 2\nline 3";
        let ranges = vec![LineRange {
            path: "test.txt".to_string(),
            start: 1,
            end: 3,
        }];

        let result = extract_complement_lines(content, &ranges, "test.txt");
        let result_str = String::from_utf8(result).unwrap();

        // Should be empty string
        assert_eq!(result_str, "");
    }

    #[test]
    fn test_round_trip_extraction() {
        let content = b"line 1\nline 2\nline 3\nline 4\nline 5";
        let ranges = vec![LineRange {
            path: "test.txt".to_string(),
            start: 2,
            end: 3,
        }];

        let selected = extract_lines_from_content(content, &ranges, "test.txt");
        let remaining = extract_complement_lines(content, &ranges, "test.txt");

        let selected_str = String::from_utf8(selected).unwrap();
        let remaining_str = String::from_utf8(remaining).unwrap();

        let selected_lines: Vec<&str> = selected_str.lines().collect();
        let remaining_lines: Vec<&str> = remaining_str.lines().collect();

        // Together they should have all the lines
        assert_eq!(selected_lines.len() + remaining_lines.len(), 5);

        // No overlap
        for line in &selected_lines {
            assert!(!remaining_lines.contains(line));
        }
    }
}
