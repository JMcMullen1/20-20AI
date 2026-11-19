# 20/20 Course AI

A 20/20-branded chat page for the APM AI certificate courses, running on the Claude API. Delegates open it from an Adobe Connect Web Links pod in each breakout room.

## Course links

- AI Awareness for Project Professionals: `https://YOUR-APP.onrender.com/?course=awareness`
- Working with AI in Project Teams: `https://YOUR-APP.onrender.com/?course=teams`

## Settings (environment variables)

| Setting | What it's for | Default |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Your Claude API key. Server only, never in the page. | none (demo mode) |
| `ACCESS_CODE` | Code delegates type to get in. Change it each course run. | none |
| `APP_NAME` | Name shown on the page. | 20/20 Course AI |
| `MODEL` | Claude model. | claude-opus-5-5 |
| `EFFORT` | How hard Claude thinks: `low`, `medium`, `high`. | low |
| `MAX_TOKENS` | Longest reply allowed. | 4000 |
| `PER_MINUTE` | Messages per person per minute. | 12 |
| `DAILY_CAP` | Messages per day across everyone. | 1500 |

## Deploying on Render

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, pick this repo. Render reads `render.yaml`.
3. When asked, fill in `ANTHROPIC_API_KEY` and `ACCESS_CODE`.
4. Open `/?course=awareness`. If you see a red **Demo** badge, the key isn't set.

## Files

- `server.js`: serves the page and calls Claude through the official Anthropic SDK.
- `prompts.js`: the instructions and case study facts for each course.
- `public/`: the chat page and logo.
- `render.yaml`: Render setup. `Dockerfile`: for container hosts.

The server does not store conversations. Check Anthropic's data terms with your IT and data protection leads before launch.
