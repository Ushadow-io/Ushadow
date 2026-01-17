/// Template for TDD Test Development
///
/// Copy this template when fixing bugs or adding features.
/// Follow the Red → Green → Refactor cycle.

// ============================================================================
// STEP 1: RED - Write Failing Test First
// ============================================================================
//
// Before writing ANY fix code:
// 1. Copy this test template
// 2. Replace `todo!()` with actual test
// 3. Run: cargo test --test <test_name>
// 4. VERIFY IT FAILS
// 5. Document the failure output in comments below

#[test]
#[ignore] // Remove this when you start implementing
fn test_bug_or_feature_name() {
    // === ARRANGE ===
    // Set up the scenario that triggers the bug or tests the feature
    // Example:
    // let input = "problematic input";
    // let expected = "expected output";

    todo!("1. Set up test scenario");

    // === ACT ===
    // Call the function that has the bug or implements the feature
    // Example:
    // let result = function_under_test(input);

    todo!("2. Call the function to test");

    // === ASSERT ===
    // Verify the expected behavior
    // Example:
    // assert_eq!(result, expected, "Bug: description of what's wrong");
    // assert!(!result.contains('/'), "Should not contain forward slashes");

    todo!("3. Add assertions");
}

// ============================================================================
// EXPECTED FAILURE OUTPUT (Document this after running the test)
// ============================================================================
//
// When you run `cargo test test_bug_or_feature_name`, paste the failure here:
//
// Example:
// ```
// ---- test_bug_or_feature_name stdout ----
// thread 'test_bug_or_feature_name' panicked at 'assertion failed: !result.contains('/')
// Result contains forward slashes: C:\Users\test/Documents'
// ```
//

// ============================================================================
// STEP 2: GREEN - Write Minimal Code to Pass
// ============================================================================
//
// Now go to the source file and write the simplest code that makes the test pass.
// Run: cargo test test_bug_or_feature_name
// Expected: ✅ test ... ok
//

// ============================================================================
// STEP 3: REFACTOR - Improve Code Quality
// ============================================================================
//
// Now improve the code:
// - Add more test cases (edge cases, error conditions)
// - Extract helper functions
// - Improve naming
// - Add documentation
//
// After each change, run: cargo test
// All tests should still pass!

#[test]
#[ignore] // Remove when implementing edge case tests
fn test_edge_case_1() {
    todo!("Add edge case tests after main test passes");
}

#[test]
#[ignore] // Remove when implementing edge case tests
fn test_edge_case_2() {
    todo!("Add edge case tests after main test passes");
}

// ============================================================================
// EXAMPLE: Completed TDD Test
// ============================================================================
//
// Here's what a completed test looks like:

#[cfg(test)]
mod example_completed_test {
    use std::env;

    // Helper function we're testing (this would be in src/)
    fn normalize_path_example(path: &str) -> String {
        #[cfg(target_os = "windows")]
        {
            path.replace('/', "\\")
        }

        #[cfg(not(target_os = "windows"))]
        {
            path.to_string()
        }
    }

    // STEP 1: RED - This test was written FIRST and FAILED
    #[test]
    #[cfg(target_os = "windows")]
    fn test_windows_path_normalization() {
        // ARRANGE
        let frontend_path = "C:/Users/test/ushadow";

        // ACT
        let result = normalize_path_example(frontend_path);

        // ASSERT
        assert_eq!(
            result,
            "C:\\Users\\test\\ushadow",
            "Should normalize forward slashes to backslashes"
        );

        assert!(
            !result.contains('/'),
            "Should not contain any forward slashes: {}",
            result
        );
    }

    // EXPECTED FAILURE (documented after running test):
    // ---- test_windows_path_normalization stdout ----
    // thread panicked at 'compilation error: no function normalize_path_example'

    // STEP 2: GREEN - Wrote normalize_path_example() function above
    // Test now passes ✅

    // STEP 3: REFACTOR - Add edge case tests
    #[test]
    #[cfg(target_os = "windows")]
    fn test_already_normalized_paths() {
        let path = "C:\\Users\\test";
        assert_eq!(normalize_path_example(path), path);
    }

    #[test]
    #[cfg(not(target_os = "windows"))]
    fn test_unix_paths_unchanged() {
        let path = "/Users/test/project";
        assert_eq!(normalize_path_example(path), path);
    }
}
