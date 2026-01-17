# TDD Process - MANDATORY FOR ALL CODE CHANGES

## The Rule: Red → Green → Refactor

**ALL bug fixes and new features MUST follow Test-Driven Development.**

### Why This Matters

- **Confidence**: A test that never failed might be testing the wrong thing
- **Documentation**: Tests show exactly what bug was fixed
- **Regression Prevention**: Proves the test will catch the bug if it returns
- **Design**: Writing tests first leads to better API design

## The Process

### 1. RED - Write a Failing Test First

Before writing ANY fix or feature code:

```rust
#[test]
fn test_bug_description() {
    // Arrange: Set up the scenario that triggers the bug
    let input = create_buggy_scenario();

    // Act: Call the buggy function
    let result = buggy_function(input);

    // Assert: This SHOULD fail with current code
    assert_eq!(result, expected_value, "Bug: description of what's wrong");
}
```

**CRITICAL**: Run `cargo test` and **VERIFY THE TEST FAILS**

```bash
cargo test test_bug_description
# Expected output: ❌ FAILED
```

If the test passes immediately, you're testing the wrong thing!

### 2. GREEN - Write Minimal Code to Pass

Now write the simplest code that makes the test pass:

```rust
pub fn buggy_function(input: Input) -> Output {
    // The fix goes here
}
```

Run tests again:

```bash
cargo test test_bug_description
# Expected output: ✅ ok
```

### 3. REFACTOR - Clean Up

Now improve the code quality without changing behavior:
- Extract functions
- Improve names
- Add documentation
- Remove duplication

Run tests after each refactor to ensure nothing broke.

## Examples

### Example 1: Windows Path Separator Bug

**❌ WRONG APPROACH** (What we did):
1. Wrote `normalize_path()` function
2. Wrote tests afterward
3. Tests all passed immediately
4. ⚠️ No confidence the tests catch the bug!

**✅ CORRECT APPROACH** (TDD):

```rust
// STEP 1: RED - Write failing test
#[test]
#[cfg(target_os = "windows")]
fn test_frontend_paths_get_normalized() {
    let frontend_path = "C:/Users/test/ushadow";
    let normalized = normalize_path(frontend_path);

    assert!(!normalized.contains('/'),
        "Frontend paths should have no forward slashes on Windows: {}",
        normalized);
}

// Run: cargo test → ❌ compilation error: no function `normalize_path`
```

```rust
// STEP 2: GREEN - Minimal implementation
pub fn normalize_path(path: &str) -> String {
    #[cfg(target_os = "windows")]
    {
        path.replace('/', "\\")
    }

    #[cfg(not(target_os = "windows"))]
    {
        path.to_string()
    }
}

// Run: cargo test → ✅ passes
```

```rust
// STEP 3: REFACTOR - Add documentation, edge case tests
/// Normalize path separators to the platform standard
///
/// On Windows: Converts all forward slashes to backslashes
/// On Unix: Returns path unchanged
pub fn normalize_path(path: &str) -> String {
    // ... same implementation
}

// Run: cargo test → ✅ still passes
```

## For AI Agents

When an AI agent (Claude, GitHub Copilot, etc.) is fixing a bug or adding a feature:

1. **ALWAYS ask**: "Can you show me a failing test first?"
2. **VERIFY** the test fails before accepting the fix
3. **DOCUMENT** the failure output in comments or commit messages
4. **NEVER** write tests after the fix - this defeats the purpose

## For Code Reviewers

In PR reviews, check:
- [ ] Test was written before the fix (check git history)
- [ ] Commit shows test failing first
- [ ] Test specifically targets the bug/feature
- [ ] Test would catch regression if code was reverted

## Testing Strategy by Type

### Bug Fixes
1. Write test that reproduces the bug (should fail)
2. Fix the bug (test should pass)
3. Document the original failure in test comments

### New Features
1. Write test for simplest case (should fail)
2. Implement minimal feature (test passes)
3. Add tests for edge cases
4. Refactor for clarity

### Refactoring
1. Ensure existing tests pass
2. Refactor code
3. Tests still pass (behavior unchanged)

## Enforcement

### Optional Verification Script

We provide `scripts/verify-tdd.sh` as an **optional** tool to help verify TDD practices:

```bash
# Run manually before creating PR
./scripts/verify-tdd.sh

# Or add to pre-commit hook (optional, can be intrusive)
# .git/hooks/pre-commit
./scripts/verify-tdd.sh

# Or run in CI pipeline
# .github/workflows/test.yml
- run: ./scripts/verify-tdd.sh
```

The script checks:
- All tests pass
- Changed source files have corresponding tests
- Warns if tests and source are in same commit (suggests tests weren't written first)

**Note**: This is an optional helper, not mandatory. Use it if it helps your workflow.

### Pre-commit Hook

Consider adding a hook that checks for:
- Tests in the same commit as bug fixes
- Test files modified before source files (by timestamp)

### CI Checks

- Run `cargo test` on every commit
- Fail builds if test coverage drops
- Require test-to-code ratio thresholds

### Agent Instructions

Added to `CLAUDE.md`:
- All bug fixes MUST include failing test first
- Agent must show test failure before proposing fix
- Agent should verify fix by re-running tests

## Common Mistakes

### ❌ Writing Test After Fix
```
git commit -m "Fix Windows path bug + add tests"
```
Problem: Can't verify test catches the bug!

### ✅ Proper TDD Flow
```
git commit -m "Add failing test for Windows path bug"
git commit -m "Fix Windows path separator normalization"
git commit -m "Add edge case tests for path normalization"
```

### ❌ Test That Can't Fail
```rust
#[test]
fn test_addition() {
    assert_eq!(2 + 2, 4); // This will always pass
}
```

### ✅ Test That Catches Real Bug
```rust
#[test]
fn test_windows_mixed_separators_bug() {
    // This would fail before fix:
    // Expected: "C:\\Users\\test\\file"
    // Got:      "C:\\Users\\test/file"
    let result = normalize_path("C:/Users/test/file");
    assert!(!result.contains('/'));
}
```

## Resources

- [Test-Driven Development by Example](https://www.amazon.com/Test-Driven-Development-Kent-Beck/dp/0321146530) - Kent Beck
- [Growing Object-Oriented Software, Guided by Tests](https://www.amazon.com/Growing-Object-Oriented-Software-Guided-Tests/dp/0321503627)
- Rust Testing Guide: https://doc.rust-lang.org/book/ch11-00-testing.html

## Quick Reference Card

```
┌─────────────────────────────────────────────┐
│ TDD CHECKLIST                               │
├─────────────────────────────────────────────┤
│ □ Write test first                          │
│ □ Run test - verify it FAILS               │
│ □ Write minimal code to pass                │
│ □ Run test - verify it PASSES              │
│ □ Refactor for clarity                      │
│ □ Run test - still PASSES                   │
│ □ Commit with descriptive message           │
└─────────────────────────────────────────────┘
```
