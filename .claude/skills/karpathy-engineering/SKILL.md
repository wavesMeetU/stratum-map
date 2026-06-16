# Karpathy Engineering Principles

## Core Philosophy

> "Make it work, make it right, make it fast." — in that order.

Simplicity is the ultimate sophistication. Complex solutions are usually wrong solutions.

## Fundamental Principles

### 1. Think Before Coding

**Rule**: Spend more time thinking than typing.

**Workflow**:
1. Understand the problem fully
2. Identify the simplest possible solution
3. Plan the implementation
4. THEN write code

**Anti-pattern**: Jumping to implementation before understanding.

### 2. Simplicity First

**Rule**: The simplest solution that works is the best solution.

**Guidelines**:
- Prefer clear code over clever code
- Avoid premature optimization
- Choose readability over performance (until proven otherwise)
- Delete code, don't add it

**Questions to ask**:
- Can I solve this with fewer lines?
- Am I introducing unnecessary complexity?
- Would a junior developer understand this?

### 3. Surgical Changes

**Rule**: Make the smallest change that achieves the goal.

**Approach**:
- One concept per commit
- Small, focused pull requests
- Testable changes in isolation
- No "kitchen sink" commits

**Benefits**:
- Easier code review
- Faster rollback
- Clearer git history
- Simpler debugging

### 4. Goal-Driven Execution

**Rule**: Every line of code must serve a clear purpose.

**Before coding**, ask:
- What problem am I solving?
- What is the minimum change needed?
- How will I verify success?

**During coding**, ask:
- Is this line necessary?
- Does this serve the goal?
- Can I simplify further?

## Required Workflow

### Audit First

```
Understand → Plan → Implement → Verify
```

**Never skip to implementation.**

### Audit Checklist

1. Read existing code
2. Understand current behavior
3. Identify root cause
4. Research similar solutions
5. Plan minimal change

### Implementation Principles

1. **Change one thing at a time**
2. **Test after each change**
3. **Commit working states**
4. **Document the "why" not the "what"**

## Anti-Patterns to Avoid

### ❌ Premature Optimization

```
// Bad: Optimizing before measuring
function fastButComplex() {
  // 100 lines of cache-aware code
}

// Good: Simple and correct
function simple() {
  // 5 lines of clear code
}
```

### ❌ Over-Engineering

```
// Bad: Building for hypothetical futures
class AbstractFactoryFactory {
  create() {
    return new AbstractFactory();
  }
}

// Good: Solve current problem
function create() {
  return new Factory();
}
```

### ❌ Cargo-Cult Programming

```
// Bad: Copying patterns without understanding
// TODO: Fix this (copied from StackOverflow)

// Good: Understand or remove
// This validation ensures X because Y
```

## Debugging Philosophy

### When Something Breaks

1. **Assume nothing** — Verify your assumptions
2. **Simplify** — Remove complexity to isolate the issue
3. **Measure** — Don't guess, use data
4. **Understand** — Don't patch what you don't understand

### Debugging Workflow

```
Observe → Hypothesize → Test → Understand → Fix
```

Not:
```
Try random things → Hope it works → Move on
```

## Code Quality Standards

### Clarity Over Cleverness

```typescript
// Clear
const isVisible = zoom >= 5 && isLayerEnabled;

// Clever (bad)
const v = z > 4 ? !!l : false;
```

### Explicit Over Implicit

```typescript
// Explicit
function calculateFrameTime(start: number, end: number): number {
  return end - start;
}

// Implicit (bad)
function calc(s: number, e: number) {
  return e - s;
}
```

## Testing Philosophy

### Test Behavior, Not Implementation

```typescript
// Good: Tests what users care about
expect(renderer.visibleInstances).toBe(expected);

// Bad: Tests implementation details
expect(renderer.internalBuffer.length).toBe(1000);
```

### Tests Are Documentation

Tests should answer:
- What is this supposed to do?
- What are the edge cases?
- How should this fail?

## Refactoring Principles

### When to Refactor

1. You'll understand the code better after reading it
2. You're about to add a feature and the current structure resists it
3. You found a bug and the code structure made it hard to find

### When NOT to Refactor

1. Just because you don't like the style
2. To "clean up" without a specific goal
3. When the code is working and you're touching it for the first time

## Git Hygiene

### Commit Structure

```
feat(scope): description

Fixes #issue

Explanation of why, not what.

Co-Authored-By: Contributor <email>
```

### Commit Frequency

- Commit often, push when complete
- One logical change per commit
- Keep commits atomic

## Code Review Philosophy

### As Reviewer

1. Assume the author had a reason
2. Ask "why?" not "change this"
3. Suggest, don't dictate
4. Praise good patterns

### As Author

1. Explain the "why" in the description
2. Keep PRs focused
3. Respond to all feedback
4. Know when to push back

## Learning from Karpathy

### Key Lessons

1. **First principles thinking** — Understand from scratch
2. **Build to learn** — Implement to understand
3. **Teach to learn** — Explain to clarify
4. **Simplify relentlessly** — Complexity is usually wrong

### Quote Collection

> "If you can't explain it simply, you don't understand it well enough."
>
> "The best code is no code. Every line of code is a liability."
>
> "Make it work, make it right, make it fast — in that order."

## Application to This Project

### For Stratum Map

1. **ViewState first** — Understand camera before rendering
2. **One layer at a time** — Master parser before GPU
3. **Examples are truth** — Trust working code over documentation
4. **Simplify the pipeline** — Each layer has one job

### Decision Framework

When facing a choice:

1. Which option is simpler?
2. Which has fewer moving parts?
3. Which is easier to test?
4. Which is easier to understand?

Choose that one.

---

**Source**: Inspired by Andrej Karpathy's engineering philosophy
**Applied**: Stratum Map project workflow
