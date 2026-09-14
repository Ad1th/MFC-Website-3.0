# Mozilla Firefox Club, VIT Vellore

The club's website, told as a scroll film: *Chasing the Fox*. A fox made of fire runs through eleven scenes (the club, its domains, projects, events, writing, team and a way to get in touch) while every word on the page stays real, selectable HTML. People who prefer less motion, or whose devices cannot run the film, get still mode: a captured frame per scene with the same content over it.

## Run it

Needs Node 22.19 or newer.

```sh
npm install
npm run dev          # http://localhost:5173
npm run build        # fetches blog posts and GitHub activity, validates content, builds, checks the output
npm run preview      # serves the production build
npm run lint
npm test             # Playwright: Chromium and Firefox (PW_WEBKIT=1 adds WebKit)
```

### Environment

Copy `.env.example` to `.env.production` (not committed) and fill in:

| variable | used for |
|---|---|
| `VITE_API_URL` | the backend for the contact form (`POST /api/contact`) and newsletters (`GET /api/v1/newsLetter/getAllNewsLetters`). Without it the form offers a prefilled email instead, and newsletters fall back to `src/content/newsletters.json`. |
| `SITE_URL` | the production address, build time only. Adds `sitemap.xml`, the canonical link and absolute share-image tags. Without it those are left out; `robots.txt` and the JSON-LD still ship. |
| `GITHUB_TOKEN` | optional, build time. Raises the GitHub API budget for the commit meteors in scene 3. |

### Useful URL flags

| flag | effect |
|---|---|
| `?still=1` | still mode |
| `?tier=0\|1\|2\|3` | force a quality tier (0 is still mode) |
| `?weather=rain\|storm\|clear\|fog\|cloudy\|drizzle` | pretend Vellore's weather |
| `?tz=Europe/London` | pretend the viewer's timezone (the arc, the traceroute) |
| `?at=2026-06-21T12:00:00Z` | pretend the time (sun, clocks) |
| `?visits=1\|2\|5` | pretend a returning visitor |
| `?commits=0`, `?newsletters=0`, `?blogs=0` | empty states |
| `?backend=down` | the contact form's fallback |

Dev and test builds only: `?debug` (frame stats HUD), `?sandbox=fox` (the fox on its own), `?freeze=1` (no time-based motion, for screenshots).

## How the film works

- **One scroll, one timeline.** `src/film/timeline.js` lists the scenes in order with their scroll length in vh (desktop and mobile), tab titles and the HTML region each one tells. `src/film/scroll.js` (Lenis and GSAP ScrollTrigger) turns the page's scroll into `activeScene` and `sceneProgress` in the store.
- **One store.** `src/film/store.js` (zustand) holds scroll state, quality tier, sound, the living layer's flags and the race home. Per-frame code reads it with `film.getState()`; React only subscribes to coarse values.
- **One canvas, one camera, one fox.** `src/film/Film.jsx` mounts each scene only while it or a neighbour is active.
  - Each scene registers a camera shot (`registerShot`) and a fox shot (`registerFoxShot`): pure functions of the scene's progress, so scrolling back rewinds everything.
  - `CameraRig` springs the one camera toward the active shot.
  - `FilmFox` places the one fox.
  - The rule: a shot at progress 1 equals the next scene's shot at progress 0. Set changes happen behind a whiteout or flash (the shot's `cut` value changes).
- **The fox** lives in `src/film/fox/`: the rig, a mood brain (`foxBrain.js`), additive behaviours (`behaviours.js`) and the ember shaders.
- **Real HTML.** `src/dom/Semantic.jsx` renders every region (about, domains, projects, events, writing, team, contact, end) as semantic HTML in each scene's slice of the scroll. In film mode, scenes listed in `src/film/built.js` paint their text in the film and keep the HTML unpainted but focusable. Keyboard focus paints it and jumps the film there.
- **Quality tiers** (`src/film/quality.js`): chosen from the GPU and device, lowered by a one second warm-up benchmark and live by drei's PerformanceMonitor.
- **The living layer** (`src/live/`): the tab, the ember cursor, the console fox, keyboard secrets, the race home, sound and the score, haptics.
- **Still mode** (`src/dom/Still.jsx`): the same regions in the film's order, each over a frame from `public/stills/`, made by `scripts/capture-stills.mjs`.

## Edit the content (JSON only)

All content lives in `src/content/` and is validated by `npm run check:content` (also part of `npm run build`). The check rejects:
- em and en dashes
- `#` placeholder links
- banned phrases
- media paths that do not exist
- events out of order

Images go in `media-src/` and become web images with `npm run images` (AVIF and WebP in `public/media/`).

### Add a board year
In `team.json`, add a key under `years` named like `"2027-28"` with a list of members:

```json
{ "name": "Full Name", "role": "Technical Head", "domain": "technical", "photo": "/media/team/2027-28/full-name.webp", "links": { "linkedin": "https://...", "github": "https://..." } }
```

- `domain` is one of `core`, `technical`, `design`, `management` or `mentor`.
- `photo` may be `null`.
- The newest year is picked automatically. The sky (scene 9) gets a new constellation, and the year dial a new position.

### Add a project
Append to `projects.json`:
- `slug`, `number` (two digits)
- `name`, `tagline` (60 characters at most), `description` (20 to 320 characters)
- `stack` (a list)
- `link` with `linkType` (`visit` or `source`)
- `image` under `/media/projects/`, with `imageAlt`

The gallery (scene 6) adds a slab. Each project dives into its own mini-world, keyed by slug in `src/film/gallery/worlds/index.js`; a project without one uses the doors world until one is written.

### Add an event
Add to `events.json`, keeping the list newest first:
- `slug`, `name`, `date` (`YYYY-MM-DD`)
- `flagship` (true or false)
- `summary` (25 words at most), `description`
- `link`, `image` (or `null`)

Every event blooms as an ember on the spiral (scene 7); flagship events also pin the climb for a moment. The four current flagships have their own scenes in `src/film/spiral/Flagships.jsx`; a new flagship pins without one until it is written.

### Add a newsletter
Newsletters come from the backend (`GET /api/v1/newsLetter/getAllNewsLetters`). While it is unavailable, add items to `newsletters.json`:

```json
{ "title": "...", "uploadDate": "2026-09-01", "cover_url": "https://...", "pdf_link": "https://..." }
```

Blog posts come from the club's Medium feed at build time (`src/content/generated/blogs.json`); nothing to edit.

## Add a scene

1. Add an entry to `SCENES` in `src/film/timeline.js`:
   - `id`, `name`, `chapter`
   - `vh` (desktop and mobile)
   - `titles`
   - `region` (or `null`)
2. Create `src/film/scenes/SxxName.jsx`:
   - register a shot and a fox shot with `registerShot` and `registerFoxShot`
   - read progress with `sceneProgressOf('Sxx')`
   - give the set its own world origin, like the existing scenes
   - honour `FILM_FREEZE` for anything time-based
3. Mount it in `src/film/Film.jsx` with a window component, like the others (`Math.abs(active - INDEX) <= 1`).
4. Keep the handover: its shot at 0 must match the previous scene at 1, and its shot at 1 the next scene at 0.
5. When its content is painted by the film, add its id to `BUILT_SCENES` in `src/film/built.js`. When its HTML is the visible layer, add it to `DOM_SCENES` too.
6. If it has a region, add the component to `REGIONS` in `src/dom/Semantic.jsx`.
7. Add a still moment to `MOMENTS` in `scripts/capture-stills.mjs`, then re-run it against a test build (see the script header).
8. Add a Playwright spec in `tests/`.

## Checks before shipping

- `npm run build` (content check, build, and `scripts/check-dist.mjs`, which fails if test hooks or development tools reach production)
- `npm run lint` and `npm test` (and `PW_WEBKIT=1 npm test` for Safari's engine)
- `node scripts/lighthouse.mjs` against `npm run preview -- --port 4175`

## Credits and licenses

- **Fox model:** PixelMannen (CC0 1.0).
- **Fox rigging and animation:** tomkranis (CC-BY 4.0).
- **Fox glTF conversion:** @AsoboStudio and @scurest (CC-BY 4.0). From the Khronos glTF Sample Assets; see `public/models/CREDITS.md`.
- **Fonts:** Mozilla Headline and Mozilla Text by Mozilla, Fira Code by Nikita Prokopov (SIL OFL 1.1).
- **Animation:** GSAP by GreenSock (GSAP Standard License).
- **Earth textures:** see `public/CREDITS.md`.

Built by Ad1th for the Mozilla Firefox Club, VIT Vellore.
