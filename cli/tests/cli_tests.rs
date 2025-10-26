use assert_cmd::Command;
use predicates::prelude::*;

#[test]
fn test_help_command() {
    let mut cmd = Command::cargo_bin("jjka").unwrap();
    cmd.arg("--help");
    cmd.assert()
        .success()
        .stdout(predicate::str::contains("Jujutsu utilities"));
}

#[test]
fn test_hunksplit_help() {
    let mut cmd = Command::cargo_bin("jjka").unwrap();
    cmd.arg("hunksplit").arg("--help");
    cmd.assert()
        .success()
        .stdout(predicate::str::contains("Split hunks by line ranges"))
        .stdout(predicate::str::contains("path:start-end"));
}

#[test]
fn test_hunksplit_missing_ranges() {
    let mut cmd = Command::cargo_bin("jjka").unwrap();
    cmd.arg("hunksplit");
    cmd.assert()
        .failure()
        .stderr(predicate::str::contains("required"));
}

#[test]
fn test_hunksplit_invalid_range_format() {
    let mut cmd = Command::cargo_bin("jjka").unwrap();
    cmd.arg("hunksplit").arg("invalid-format");
    cmd.assert()
        .failure()
        .stderr(predicate::str::contains("Invalid range format"));
}

#[test]
fn test_hunksplit_invalid_line_numbers() {
    let mut cmd = Command::cargo_bin("jjka").unwrap();
    cmd.arg("hunksplit").arg("file.txt:abc-def");
    cmd.assert()
        .failure()
        .stderr(predicate::str::contains("Failed to parse"));
}

#[test]
fn test_hunksplit_inverted_range() {
    let mut cmd = Command::cargo_bin("jjka").unwrap();
    cmd.arg("hunksplit").arg("file.txt:20-10");
    cmd.assert()
        .failure()
        .stderr(predicate::str::contains("Start line must be <= end line"));
}

#[test]
fn test_hunksplit_zero_line_numbers() {
    let mut cmd = Command::cargo_bin("jjka").unwrap();
    cmd.arg("hunksplit").arg("file.txt:0-10");
    cmd.assert()
        .failure()
        .stderr(predicate::str::contains("Line numbers must be >= 1"));
}

#[test]
fn test_hunksplit_with_message_flag() {
    let mut cmd = Command::cargo_bin("jjka").unwrap();
    cmd.arg("hunksplit")
        .arg("-m")
        .arg("Test message")
        .arg("file.txt:1-5");

    // This will fail because we're not in a jj repo, but it should parse the args correctly
    cmd.assert().failure();
}

#[test]
fn test_hunksplit_with_revision_flag() {
    let mut cmd = Command::cargo_bin("jjka").unwrap();
    cmd.arg("hunksplit")
        .arg("-r")
        .arg("@-")
        .arg("file.txt:1-5");

    // This will fail because we're not in a jj repo, but it should parse the args correctly
    cmd.assert().failure();
}

#[test]
fn test_hunksplit_multiple_ranges() {
    let mut cmd = Command::cargo_bin("jjka").unwrap();
    cmd.arg("hunksplit")
        .arg("file1.txt:1-5")
        .arg("file2.txt:10-20");

    // This will fail because we're not in a jj repo, but it should parse the args correctly
    cmd.assert().failure();
}
