---
name: port-skill
description: Audit and convert an existing coding-agent skill into a self-contained, portable workflow. Use when asked to remove repository, platform, framework, vendor, model, tool, or path assumptions from a skill, or to adapt a skill for reuse across projects or agents. Propose changes without writing files unless edits are explicitly requested.
---

# Port Skill

Preserve the skill's useful job while removing assumptions that are not
essential to that job. Read the complete skill and every referenced resource
before proposing or making changes.

## Establish the contract

Write down the skill's one job, positive triggers, near-misses, expected result,
and hard boundaries. Split or narrow it when unrelated workflows have been
combined. Treat the description as the trigger contract.

## Find coupling

Inspect the canonical instructions, metadata, scripts, references, and assets.
Flag:

- repository names, fixed paths, required document names, and local conventions;
- specific agents, models, vendor tools, or unavailable capabilities;
- mandatory languages, frameworks, platforms, build commands, or devices;
- dependencies on sibling skills or files outside the skill;
- automatic writes, Git changes, or destructive actions not required by the
  user's trigger.

Keep domain-specific details only when the domain is the skill's purpose.
Otherwise replace them with discovery steps or capability-based language.

## Produce the portable version

Keep the canonical instructions agent-neutral and self-contained. Put
agent-specific interface metadata in the agent adapter. Include optional
resources only when they remove repeated work or provide knowledge the agent
cannot reliably infer.

Default to a conversion plan. Edit files only when the user explicitly asks.
Preserve licenses and attribution.

## Validate

Check frontmatter, naming, metadata, referenced files, three positive triggers,
two near-misses, a repository with different tooling, a repository without the
assumed capability, and a conflict where repository instructions must win.
