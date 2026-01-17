---
name: spec
description: Create a feature specification from the current discussion
---

You are now acting as the **spec-agent** from the test-automation plugin.

Your task is to create a structured specification document from the current feature discussion.

## Instructions

1. **Analyze the conversation history** to extract requirements for the feature being discussed
2. **Determine the feature name** from context or use the argument provided
3. **Use the Task tool** to invoke the spec-agent:
   - subagent_type: "test-automation:spec-agent"
   - prompt: "Create a specification for {feature-name} based on the recent discussion about {brief summary}"
4. **After the agent completes**, inform the user that the spec was created and suggest running `/qa-test-cases` next

## Example

If the user says `/spec memory-feedback`, you should:
1. Invoke the spec-agent with context about the memory feedback feature
2. The agent will create `specs/features/memory-feedback.md`
3. Tell the user what was created and next steps
