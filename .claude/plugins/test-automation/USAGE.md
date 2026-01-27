# Test Automation Plugin - Quick Usage Guide

## ✅ Plugin is Now Fixed and Working

Your plugin has been refactored to work correctly with Claude Code's architecture.

## How to Use

### Available Commands

All skills are invoked with the plugin namespace:

```bash
/test-automation:spec [feature-name]
/test-automation:qa-test-cases [feature-name]
/test-automation:automate-tests [feature-name]
```

### Typical Workflow

#### 1. Create Specification
During a feature discussion:

```bash
User: "I want to add user profile editing"
You: /test-automation:spec user-profile-editing
```

**Result**: Creates `specs/features/user-profile-editing.md` with:
- User stories
- Functional requirements
- Non-functional requirements
- Integration points
- Security considerations

#### 2. Generate Test Cases
After spec is approved:

```bash
/test-automation:qa-test-cases user-profile-editing
```

**Result**: Creates `specs/features/user-profile-editing.testcases.md` with:
- Comprehensive test scenarios
- Happy path, edge cases, negative tests
- Test type categorization (unit/integration/API/E2E)
- Secret requirements marked

#### 3. Generate Test Code
After test cases are reviewed:

```bash
/test-automation:automate-tests user-profile-editing
```

**Result**: Generates executable test files:
- `ushadow/backend/tests/test_*.py` (unit tests)
- `ushadow/backend/tests/integration/test_*.py` (integration tests)
- `robot_tests/api/*.robot` (API tests)
- `frontend/e2e/*.spec.ts` (E2E tests)
- Updates Page Object Models
- Adds `data-testid` attributes to frontend

## What Was Fixed

### Before (Broken)
- Skills tried to invoke plugin agents via Task tool
- Plugin agents can't be called with `subagent_type` parameter
- Commands wouldn't work

### After (Working)
- All agent logic merged directly into skills
- Skills are self-contained and executable
- Agent files kept for documentation only

## Architecture Notes

**Skills** (`.claude/plugins/*/skills/*.md`):
- ✅ Can be invoked: `/plugin-name:skill-name`
- Contains executable instructions
- Claude follows the instructions directly

**Agents** (`.claude/plugins/*/agents/*.md`):
- ❌ Cannot be invoked via Task tool
- Kept for documentation/reference
- Logic should be in skills, not agents

## Testing the Plugin

Try it out:

```bash
# Test 1: Create a spec from this conversation
/test-automation:spec test-feature

# Test 2: List skills (should show your three skills)
# Use the Skill tool to see available skills
```

## Troubleshooting

**Skill not appearing?**
- Check `.claude/settings.json` - plugin must be enabled
- Restart Claude Code session
- Verify plugin.json lists the skill files

**Skill runs but does nothing?**
- Check that feature name is provided or inferrable
- Ensure conversation has feature context
- Skill will ask clarifying questions if needed

## File Structure

```
.claude/plugins/test-automation/
├── plugin.json                 # Plugin config
├── README.md                   # Full documentation
├── USAGE.md                    # This file
├── skills/
│   ├── spec.md                # ✅ /test-automation:spec
│   ├── qa-test-cases.md       # ✅ /test-automation:qa-test-cases
│   └── automate-tests.md      # ✅ /test-automation:automate-tests
└── agents/                     # Documentation only
    ├── spec-agent.md
    ├── qa-agent.md
    └── automation-agent.md
```

## Next Steps

1. Try creating a spec for a real feature you're working on
2. Review the generated spec and provide feedback
3. Generate test cases from the spec
4. Generate executable tests from the test cases

Happy testing!
