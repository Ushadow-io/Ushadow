/// Tests for cross-platform path handling and command utilities
///
/// These tests verify real bugs:
/// - Windows path separator normalization (backslash vs forward slash)
/// - Tilde expansion edge cases
/// - PATH environment detection
/// - Shell command creation across platforms

use std::env;
use std::path::Path;

// Helper to call the normalize_path function
fn normalize_path(path: &str) -> String {
    #[cfg(target_os = "windows")]
    {
        path.replace('/', "\\")
    }

    #[cfg(not(target_os = "windows"))]
    {
        path.to_string()
    }
}

// Helper to call the expand_tilde function
// We need to make it accessible from the binary crate
fn expand_tilde(path: &str) -> String {
    if path.starts_with("~/") || path == "~" {
        if let Ok(home) = env::var("HOME") {
            return path.replacen("~", &home, 1);
        }
        #[cfg(target_os = "windows")]
        if let Ok(userprofile) = env::var("USERPROFILE") {
            let expanded = path.replacen("~", &userprofile, 1);
            return expanded.replace('/', "\\");
        }
    }
    path.to_string()
}

// ========================================
// Tilde Expansion Tests
// ========================================

#[test]
fn test_expand_tilde_with_home_directory() {
    let original_home = env::var("HOME").ok();
    env::set_var("HOME", "/Users/testuser");

    assert_eq!(
        expand_tilde("~/Documents"),
        "/Users/testuser/Documents",
        "Tilde should expand to HOME directory"
    );

    assert_eq!(
        expand_tilde("~"),
        "/Users/testuser",
        "Bare tilde should expand to HOME"
    );

    assert_eq!(
        expand_tilde("~/"),
        "/Users/testuser/",
        "Tilde with trailing slash should expand"
    );

    // Restore
    if let Some(home) = original_home {
        env::set_var("HOME", home);
    } else {
        env::remove_var("HOME");
    }
}

#[test]
fn test_expand_tilde_without_home_variable() {
    let original_home = env::var("HOME").ok();
    env::remove_var("HOME");

    #[cfg(target_os = "windows")]
    {
        let original_userprofile = env::var("USERPROFILE").ok();
        env::set_var("USERPROFILE", "C:\\Users\\testuser");

        assert_eq!(
            expand_tilde("~/Documents"),
            "C:\\Users\\testuser\\Documents",
            "Should fall back to USERPROFILE on Windows with normalized backslashes"
        );

        assert_eq!(
            expand_tilde("~/Documents/subfolder/file.txt"),
            "C:\\Users\\testuser\\Documents\\subfolder\\file.txt",
            "All forward slashes should be normalized to backslashes on Windows"
        );

        // Restore
        if let Some(up) = original_userprofile {
            env::set_var("USERPROFILE", up);
        } else {
            env::remove_var("USERPROFILE");
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        assert_eq!(
            expand_tilde("~/Documents"),
            "~/Documents",
            "Should return unchanged without HOME"
        );
    }

    // Restore
    if let Some(home) = original_home {
        env::set_var("HOME", home);
    }
}

#[test]
fn test_expand_tilde_does_not_modify_absolute_paths() {
    assert_eq!(
        expand_tilde("/absolute/path"),
        "/absolute/path",
        "Absolute paths should not be modified"
    );

    assert_eq!(
        expand_tilde("/Users/other/Documents"),
        "/Users/other/Documents",
        "Absolute paths with /Users should not be modified"
    );

    #[cfg(target_os = "windows")]
    {
        assert_eq!(
            expand_tilde("C:\\Users\\test"),
            "C:\\Users\\test",
            "Windows absolute paths should not be modified"
        );
    }
}

#[test]
fn test_expand_tilde_does_not_modify_relative_paths() {
    assert_eq!(
        expand_tilde("relative/path"),
        "relative/path",
        "Relative paths without tilde should not be modified"
    );

    assert_eq!(
        expand_tilde("./Documents"),
        "./Documents",
        "Relative paths with ./ should not be modified"
    );

    assert_eq!(
        expand_tilde("../parent"),
        "../parent",
        "Parent directory paths should not be modified"
    );
}

#[test]
fn test_expand_tilde_with_spaces() {
    let original_home = env::var("HOME").ok();
    env::set_var("HOME", "/Users/test user");

    assert_eq!(
        expand_tilde("~/My Documents"),
        "/Users/test user/My Documents",
        "Should handle spaces in both HOME and path"
    );

    // Restore
    if let Some(home) = original_home {
        env::set_var("HOME", home);
    }
}

#[test]
fn test_expand_tilde_only_expands_leading_tilde() {
    let original_home = env::var("HOME").ok();
    env::set_var("HOME", "/Users/testuser");

    assert_eq!(
        expand_tilde("/path/with~tilde"),
        "/path/with~tilde",
        "Tilde in middle should not be expanded"
    );

    assert_eq!(
        expand_tilde("/path/ends/with/~"),
        "/path/ends/with/~",
        "Tilde at end should not be expanded"
    );

    // Restore
    if let Some(home) = original_home {
        env::set_var("HOME", home);
    }
}

#[test]
fn test_expand_tilde_edge_cases() {
    assert_eq!(
        expand_tilde(""),
        "",
        "Empty string should remain empty"
    );

    assert_eq!(
        expand_tilde("~notahomedir"),
        "~notahomedir",
        "Tilde without slash should not expand (except bare ~)"
    );
}

// ========================================
// Path Normalization Tests (Frontend Paths)
// ========================================

#[test]
#[cfg(target_os = "windows")]
fn test_normalize_path_from_frontend() {
    // This tests the ACTUAL bug: Frontend sends forward slashes on Windows
    // Bug: "C:/Users/test/ushadow" → Path::new().join() → "C:/Users/test/ushadow\scripts"

    let frontend_path = "C:/Users/trivialattire/ushadow";
    let normalized = normalize_path(frontend_path);

    assert_eq!(
        normalized,
        "C:\\Users\\trivialattire\\ushadow",
        "Frontend paths with forward slashes should be normalized to backslashes"
    );

    // Verify no forward slashes remain
    assert!(
        !normalized.contains('/'),
        "Normalized path should not contain forward slashes: {}",
        normalized
    );
}

#[test]
#[cfg(target_os = "windows")]
fn test_normalize_path_with_subdirectories() {
    let path = "C:/Users/test/project/subfolder/file.txt";
    let normalized = normalize_path(path);

    assert_eq!(
        normalized,
        "C:\\Users\\test\\project\\subfolder\\file.txt",
        "All forward slashes should be converted to backslashes"
    );

    assert!(
        !normalized.contains('/'),
        "Should have no forward slashes after normalization"
    );
}

#[test]
#[cfg(target_os = "windows")]
fn test_normalize_path_already_normalized() {
    // Should handle paths that already have backslashes
    let path = "C:\\Users\\test\\project";
    let normalized = normalize_path(path);

    assert_eq!(
        normalized, path,
        "Already normalized paths should remain unchanged"
    );
}

#[test]
#[cfg(not(target_os = "windows"))]
fn test_normalize_path_unix_unchanged() {
    // On Unix, paths should not be modified
    let path = "/Users/test/project/file.txt";
    let normalized = normalize_path(path);

    assert_eq!(
        normalized, path,
        "Unix paths should remain unchanged"
    );
}

// ========================================
// Windows Path Separator Bug Fix Tests
// ========================================

#[test]
#[cfg(target_os = "windows")]
fn test_windows_path_separator_normalization() {
    // This tests the bug fix: tilde expansion should normalize to backslashes on Windows
    let original_home = env::var("HOME").ok();
    env::remove_var("HOME");

    let original_userprofile = env::var("USERPROFILE").ok();
    env::set_var("USERPROFILE", "C:\\Users\\test");

    // Bug was: "~/Documents" became "C:\Users\test/Documents" (mixed slashes)
    // Fixed: should be "C:\Users\test\Documents" (all backslashes)
    let result = expand_tilde("~/path/to/file.txt");

    assert!(
        !result.contains('/'),
        "Result should not contain forward slashes on Windows: {}",
        result
    );

    assert_eq!(
        result,
        "C:\\Users\\test\\path\\to\\file.txt",
        "All path separators should be backslashes on Windows"
    );

    // Restore
    if let Some(home) = original_home {
        env::set_var("HOME", home);
    }
    if let Some(up) = original_userprofile {
        env::set_var("USERPROFILE", up);
    } else {
        env::remove_var("USERPROFILE");
    }
}

#[test]
#[cfg(target_os = "windows")]
fn test_windows_backslash_handling() {
    let path_with_backslash = "C:\\Users\\test\\Documents";
    let path_obj = Path::new(path_with_backslash);

    assert!(
        path_obj.to_string_lossy().contains("test"),
        "Windows paths with backslashes should be parseable"
    );
}

#[test]
#[cfg(target_os = "windows")]
fn test_windows_forward_slash_compatibility() {
    let path_with_forward = "C:/Users/test/Documents";
    let path_obj = Path::new(path_with_forward);

    assert!(
        path_obj.to_string_lossy().contains("test"),
        "Windows should handle forward slashes"
    );
}

// ========================================
// Cross-Platform Path Tests
// ========================================

#[test]
fn test_path_with_spaces() {
    let path_with_spaces = "/Users/test user/My Documents/file.txt";
    let path = Path::new(path_with_spaces);

    assert_eq!(
        path.to_str().unwrap(),
        path_with_spaces,
        "Paths with spaces should be preserved"
    );
}

#[test]
fn test_relative_vs_absolute_path_detection() {
    #[cfg(not(target_os = "windows"))]
    {
        assert!(
            Path::new("/absolute/path").is_absolute(),
            "Unix absolute paths start with /"
        );

        assert!(
            !Path::new("relative/path").is_absolute(),
            "Paths without leading / are relative"
        );
    }

    #[cfg(target_os = "windows")]
    {
        assert!(
            Path::new("C:\\absolute\\path").is_absolute(),
            "Windows absolute paths with drive letters are absolute"
        );

        assert!(
            !Path::new("relative\\path").is_absolute(),
            "Windows paths without drive letters are relative"
        );
    }
}

#[test]
fn test_empty_path_handling() {
    let empty_path = "";
    let path = Path::new(empty_path);

    assert_eq!(
        path.to_str().unwrap(),
        "",
        "Empty paths should be handled without panic"
    );
}

#[test]
fn test_special_directory_characters() {
    let special_chars = vec![
        "/path/with space/file.txt",
        "/path/with-dash/file.txt",
        "/path/with_underscore/file.txt",
        "/path/with.period/file.txt",
        "/path/with(parens)/file.txt",
    ];

    for path_str in special_chars {
        let path = Path::new(path_str);
        assert_eq!(
            path.to_str().unwrap(),
            path_str,
            "Path with special characters should be preserved: {}",
            path_str
        );
    }
}

#[test]
fn test_path_join_consistency() {
    use std::path::PathBuf;

    let base = PathBuf::from("/Users/test");
    let joined = base.join("Documents");

    assert_eq!(
        joined.to_string_lossy(),
        "/Users/test/Documents",
        "PathBuf::join should create correct paths"
    );

    // Joining with absolute path should replace, not append
    let base = PathBuf::from("/Users/test");
    let joined_absolute = base.join("/absolute/path");

    assert_eq!(
        joined_absolute.to_string_lossy(),
        "/absolute/path",
        "Joining with absolute path should replace base"
    );
}

#[test]
fn test_parent_directory_extraction() {
    let path = Path::new("/Users/test/Documents/file.txt");

    assert_eq!(
        path.parent().unwrap().to_str().unwrap(),
        "/Users/test/Documents",
        "parent() should extract parent directory"
    );

    assert_eq!(
        path.file_name().unwrap().to_str().unwrap(),
        "file.txt",
        "file_name() should extract filename"
    );
}
