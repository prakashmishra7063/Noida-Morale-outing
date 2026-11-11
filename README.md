# Microsoft Noida Morale Outing — editable website

The same responsive, dependency-free outing website as the original, plus a **web-based site editor** (`admin.html`) that can change every piece of content on the site: branding, menu, footer, every heading/label/button, event details, schedule, locations, hotel, team members, room and car allocation.

## Run locally (with saving)

```bash
python3 server.py
```

- Website: http://localhost:8000/
- Editor: http://localhost:8000/admin.html (also linked as **✎ Edit site** in the footer)

When the site runs through `server.py`, **Save to files** (or Ctrl/⌘ S) writes your edits straight into `data/*.json`. The previous version of each file is kept in `data/.backups/<timestamp>/`.

## Using the editor

- **Sections** on the left: Site & branding, Home page, Event details, Schedule, Location & route, Hotel, Team members, Rooms, Cars, Save & publish.
- **Live preview** on the right shows the real site with your edits as you type (Desktop / Mobile toggle, page picker). On smaller screens open it with **Preview**.
- **Rooms & cars**: add people from a dropdown. Adding someone who's already in another room or car moves them. Capacity problems, duplicate assignments and people without a room/car are flagged with a red badge.
- **Team members**: renaming a person updates their room and car automatically; removing a person removes them from their room and car. **Add several** lets you paste a list of names.
- **Hide pages / rename menu items** under Site & branding → Top menu.
- **Undo / Redo** in the top bar (Ctrl/⌘ Z outside text fields).
- Unsaved edits are kept in your browser, so closing the tab doesn't lose them. While you have unpublished edits, the website in *your* browser shows them with a yellow banner (Discard / Open editor); other people still see the published version.

## Publishing on GitHub Pages

GitHub Pages is static, so the editor publishes by committing to your repository:

1. Push this folder to your GitHub repository and enable **Settings → Pages → Deploy from a branch** (`main`, `/ (root)`).
2. Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) limited to that one repository with **Contents: Read and write**.
3. Open `https://<user>.github.io/<repo>/admin.html` → **Save & publish** → fill in owner, repository, branch and token → **Publish to GitHub**.

All data files go up in one commit; the live site updates within a minute or two. The token is only sent to `api.github.com` and is forgotten when the tab closes unless you tick "Remember".

> Anyone can open `admin.html`, but without a token that can write to the repository they can only change their own browser's copy — the published site is safe.

You can also **download** the JSON files from the Save & publish section and replace the ones in `data/` by hand, or **import** JSON files.

## Data files

| File | Content |
| --- | --- |
| `data/site.json` | Branding, menu labels & page visibility, footer, all page headings, labels and button text, technology groups |
| `data/event.json` | Date, departure/arrival times, important instructions, emergency contact, schedule |
| `data/hotel.json` | Hotel details, check-in/out, facilities, meals, booking notes |
| `data/locations.json` | Departure & destination addresses, Maps links, travel duration |
| `data/employees.json` | Team members and technology group |
| `data/rooms.json` | Rooms, capacity, members, notes |
| `data/cars.json` | Cars, drivers, passengers, pickup point, notes |

Each employee's car and room are worked out from `rooms.json` and `cars.json`; the editor also writes them into `employees.json` when saving so the files stay consistent.

## Photo & video gallery (OneDrive)

The **Gallery** page has two buttons: **Upload** (a OneDrive *Request files* link — people can add files without seeing the folder) and **Browse** (a shared link to the same folder). There's also a "Share your memories" banner on the home page. No extra hosting or cost: files live in your OneDrive.

### Set it up (about 5 minutes)

1. In **OneDrive** (work account), create a folder, e.g. `Noida Outing 2026 – Photos`.
2. **Upload link:** select the folder → **⋯** → **Request files** → (optionally describe what to upload) → **Next** → **Copy link**.
   *If "Request files" isn't offered, your organisation has turned it off — use a sharing link with **Can edit** instead (people can then also see and change the folder).*
3. **Browse link:** select the same folder → **Share** → **Link settings** → choose **People in your organisation** (recommended) or **Specific people** → **Can view** → **Copy link**.
4. Open the editor → **Photo gallery** → paste both links → **Save & publish**.

Leave a link empty to show "Link coming soon". Hide the whole page under **Site & branding → Top menu**.
