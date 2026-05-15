# Orchestrate multi-agent codebase review

You are coordinating five specialized review agents over this codebase. The agent prompts live in `reviews/code-review/`:

- `security-agent.md`
- `bugs-agent.md`
- `compliance-agent.md`
- `quality-agent.md`
- `architecture-agent.md`

And the synthesis prompt: `reviews/code-review/synthesis-prompt.md`

## Process

1. Create `reviews/code-review/[date]/` (using today's date in YYYY-MM-DD format) if it doesn't exist.

2. **Spawn the five agents in parallel using the Task tool.** Each gets:
   - Its prompt file contents as the task description
   - Instructions to write its output to `reviews/code-review/[date]/[agent].md`
   - Read access to the entire codebase
   - The shared finding format in reviews/code-review/finding-format.md

3. **Sanity check each output before synthesizing.** For each agent's output file:
   - Does it have findings? (Zero is suspicious; the agent probably didn't actually run a review.)
   - Is the volume plausible? (Compliance will produce the most; security and architecture the least.)
   - Did it follow the finding format with file:line citations?
   - If any agent's output looks wrong (no citations, no findings, ignored the prompt), re-run that agent before synthesizing.

4. **Run the synthesis agent** with all five outputs as inputs, per the synthesis prompt.

5. **Report back to me.** Summary of what each agent found (counts and severity distribution) and the location of the synthesis output. Don't summarize the findings themselves — I'll read the synthesis doc.

## Rules

- Spawn agents in parallel, not sequentially. They don't depend on each other.
- Don't review their findings yourself between spawn and synthesis. The synthesis agent does that.
- If a subagent fails or produces unusable output, re-run it once. If it fails again, surface the failure to me rather than synthesizing with incomplete input.
- Don't add your own findings to the synthesis. You're coordinating, not reviewing.
