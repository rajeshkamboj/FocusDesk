<div align="center">
  <img src="public/icons/icon.svg" alt="Pace app icon" width="72" />
  <h1>Pace</h1>
  <p><strong>A calmer way to make meaningful progress.</strong></p>
  <p>Choose what matters today, give it your attention, and end the day with an honest picture of what moved forward.</p>
  <p>
    <a href="#the-pace-workflow">Explore the workspace</a>
    &nbsp; · &nbsp;
    <a href="#get-started">Get started</a>
  </p>
</div>

---

> **What is the one thing that matters most today?**
>
> Pace helps you answer that question—and keep the rest of your life and work in view without letting it take over the day.

## The Pace workflow

Capture what is on your mind. Decide what matters. Focus on one thing at a time. Review the day without judgment.

| **01 · Start with clarity** | **02 · Keep work connected** |
| --- | --- |
| Choose a daily priority and build a realistic task list around it. A simple progress view keeps the day in sight. | Capture loose thoughts in your Inbox, then shape them into tasks, projects, milestones, and goals when you are ready. |
| **03 · Protect your focus** | **04 · Reflect honestly** |
| Settle into full-screen Focus Mode and use a task timer to record focused time. Pause and pick up where you left off. | Daily, weekly, and monthly reviews bring together completed work, priorities, and focused time—with no scores or guilt. |

## More than a task list

Keep ideas parked until they are ready to become work. Build a personal timeline of things you have learned. When you want a change of pace, open **Curiosity** for a fresh daily mix of spoken English, history, mythology, science, reading, and brain teasers.

Your Calendar brings scheduled tasks, deadlines, priorities, and focused time into one view. Optional daily well-being check-ins and browser reminders help support the routine around the work.

## Made to feel like yours

- **Start with a blank slate.** Your priorities, tasks, projects, and goals are yours to define—nothing is pre-filled.
- **Work your way.** Use Pace on desktop or mobile, switch between light and dark themes, and install it as a progressive web app.
- **Keep your data in reach.** Browser storage works out of the box. Optional Supabase storage and JSON export/import are available when you want them.
- **Choose your reminders.** Browser notifications can surface priorities, deadlines, task reminders, and review prompts. Delivery depends on browser support and whether the app is running in the background.

## Project plan import

In **Settings → Data → Import Project Plan**, paste or upload a
`focusdesk-project-plan` **version 1** JSON file and review it before confirming.
Create new projects, or add milestones/tasks to one existing project with exact
normalized milestone-name reuse. Existing records are never overwritten.

Tasks can include recursive **`subtasks`**: full, independently editable/timed
tasks persisted through `parentTaskId`, not just checklist text. Both import
previews show the hierarchy and top-level/subtask/total counts; Projects shows
parent-child task indentation. Limits are 2,000 total tasks (including children),
20 task levels, 100 projects, 500 milestones and 5 MiB of UTF-8 JSON. Existing v1
plans without subtasks remain supported.

See the [format, examples, safety and verification notes](docs/focusdesk-project-plan-v1.md)
and the [nested example fixture](fixtures/focusdesk-project-plan-v1.json).
No new migration was added: the checked-in task parent column is reused. Verify
live schema/FK/RLS using the deployment checks in the format doc. Supabase
milestone plans still require migration 008; imports use authenticated,
user-scoped writes with compensating rollback, not a cross-table transaction.

## Get started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No backend setup is needed to get started; the app uses browser storage by default. For optional Supabase configuration, see [`.env.example`](.env.example) and the [`supabase`](supabase/) directory.

---

<div align="center">
  <sub>Built for a steadier pace: one meaningful step at a time.</sub>
</div>
