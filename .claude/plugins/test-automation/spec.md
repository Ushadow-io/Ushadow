---
name: spec
description: Create a feature specification from the current discussion
---

Create a structured specification document from the current feature discussion.

This skill will:
1. Analyze the conversation to extract requirements
2. Ask clarifying questions if needed
3. Create a specification document in `specs/features/{feature-name}.md`
4. Present for review

After creating the spec, you can use `/qa-test-cases` to generate test cases.

Usage:
- `/spec` - Create spec from current discussion
- `/spec feature-name` - Create spec with specific name
