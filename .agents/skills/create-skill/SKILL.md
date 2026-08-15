---
name: create-skill
description: Create, improve, shorten, or review a coding-agent skill (a SKILL.md workflow file). Use when asked to design, write, edit, or fix a skill for any agent — Claude Code, Codex, or others. Drafts in conversation; writes files only when asked.
---

# Create Skill

A skill teaches an agent one workflow. Make it short, precise, and effective:
every sentence must change the agent's behavior — if cutting it changes
nothing, cut it.

## Define before writing

1. **One job.** What single workflow does this skill own? If two, make two skills.
2. **Triggers.** Which requests should activate it — and which similar ones should not?
3. **Result.** What does the agent do or produce when the skill works?
4. **Boundaries.** What must the skill never do?

## The description is the trigger

Agents pick skills by the frontmatter `description` alone; the body loads
only after. Write it as *what the skill does* + *when to use it*, in words a
user would actually type. Put every "when to use" detail here, never in the
body. A perfect body behind a vague description never runs.

```yaml
---
name: verb-first-kebab-name
description: <What it does>. Use when <trigger situations, in the user's words>. <Hard boundary, if any>.
---
```

## Write the body

- Most important instructions first.
- Short sentences, concrete verbs, one purpose per section, bullets for steps, whitespace over dense paragraphs.
- Be strict where mistakes are likely; leave freedom where many approaches work.
- Examples only when they prevent a real mistake.
- Reserve "never" and "always" for genuine safety or correctness rules.
- Keep the body under ~500 words. Move detail an agent needs only sometimes into `references/` files, linked from the body with a note on when to read each.
- Do not restate what the repository's agent instructions already require — those override skills anyway.

## Keep it portable

- One canonical, agent-neutral SKILL.md: name capabilities ("the available search tool"), never one agent vendor's tool names or models. Platforms the skill's domain inherently concerns (iOS, Xcode, a specific CI) are fine — the rule bars agent lock-in, not domain specificity.
- Canonical home: `.agents/skills/<name>/SKILL.md`. Expose it per agent with thin adapters — e.g. a `.claude/skills/<name>` symlink — plus a pointer line in `AGENTS.md` for agents without skill discovery.
- Agent-specific metadata (e.g. Codex's `agents/openai.yaml`) stays in the adapter layer, never in the canonical instructions.

## Validate

1. Write three requests that should trigger the skill and two near-misses that should not; check the description separates them.
2. Walk one realistic task through the body; fix every step where the agent would have to guess.
3. Read it once, top to bottom: a junior developer should follow it in one pass.
4. Apply the cut test: remove any sentence whose absence changes nothing.
5. Mechanical check: the frontmatter parses as YAML, and every file the skill references exists on disk.

Draft in conversation by default; create or edit files only when the user asks.
