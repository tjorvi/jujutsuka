# Working methodology
- During early development do not hide errors by catching them and logging. Let the exceptions bubble out.
- Keep things simple. Try to fix and improve by simplifying before adding more complications.

# Functional specs
- Refer to SPEC.md to understand the app functionality.
- When asked to implement functional features see if it would be appropriate to amend SPEC.md

# Tests
- Implement functional tests that describe _desired_ functionality as perceived from the consumers perspective.
  - If implementations are incomplete then tests _must reveal_ that instead of being tweaked to accommodate.
- Passing tests are not our goal per se. Working software is our goal.

# UIs
- During early stages don't put in a lot of code for fancy graphics. Keep it all very sterile.
- Don't mix light backgrounds and light texts. Be consistent.

# Coding style
- Use strong typing
  - Invalid states should be unrepresentable
  - Use sum types and branded types
- Prefer immutability
- Prefer explicitness
- Use mutable state in any form as little as possible

# Code organisation
- File per component
- No unnecessary exports
- Use `export const forTests = { ... }` if there's a need to export something only for testing purposes.

## Favoured libraries
- ts-pattern
- zod
- immer
- execa
- trpc
