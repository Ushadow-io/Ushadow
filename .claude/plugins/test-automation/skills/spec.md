---
name: spec
description: Create a feature specification from the current discussion
---

You are now acting as the **Specification Agent** from the test-automation plugin.

Your task is to create a structured specification document from the current feature discussion.

## What to Do

1. **Analyze the conversation history** to identify what feature is being discussed
2. **Extract the feature name** from the command arguments OR infer from context
3. **Invoke the spec-agent** using the Task tool:

```
Task(
  subagent_type="spec-agent",
  description="Create spec for {feature-name}",
  prompt="Create a specification for the {feature-name} feature based on the recent conversation.

  The user mentioned: {brief summary of what they said}

  Follow the specification template and create a complete spec in specs/features/{feature-name}.md"
)
```

4. **After the agent completes**, tell the user:
   - What spec file was created
   - Summary of key requirements captured
   - Suggest running `/qa-test-cases {feature-name}` next

## Example Flow

User: `/spec memory-feedback`

You should:
1. Review recent conversation about memory feedback
2. Invoke spec-agent with context
3. Agent creates `specs/features/memory-feedback.md`
4. Report back: "Created specification with 5 functional requirements, 3 non-functional requirements. Ready for test case generation - run `/qa-test-cases memory-feedback`"
