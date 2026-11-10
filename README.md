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

## Photo & video gallery (Azure Blob Storage)

The **Gallery** page lets the team upload photos and videos (up to 2 GB each by default) and browse them in a grid with a full-screen viewer. Files go **straight from the browser to Azure Blob Storage**; the small server function [`api/gallery.js`](./api/gallery.js) on Vercel only checks the team code and hands out short-lived upload/view links. The storage key never reaches the browser or GitHub.

Expected cost for 50 GB: about **$1–2/month** (Hot tier storage ≈ $0.02/GB; the first 100 GB of downloads each month are free).

### One-time setup (about 10 minutes)

1. **Azure portal → Storage accounts → Create**
   - Subscription / resource group: your choice (e.g. new group `noida-outing`)
   - Storage account name: e.g. `noidaoutingmedia` (lowercase, globally unique)
   - Region: **Central India** · Performance: **Standard** · Redundancy: **LRS**
   - Advanced tab: leave **"Allow enabling anonymous access on individual containers" off** (files stay private)
   - Review + create.
2. **Copy the connection string:** storage account → **Security + networking → Access keys** → *Show* → copy **Connection string** (key1).
3. **Vercel → noida-morale-outing → Settings → Environment Variables**, add (for *Production* and *Preview*):

   | Name | Value |
   | --- | --- |
   | `AZURE_STORAGE_CONNECTION_STRING` | the connection string from step 2 |
   | `GALLERY_UPLOAD_CODE` | the team code people type to upload (share it on Teams/WhatsApp) |
   | `GALLERY_ADMIN_CODE` | a different, longer code for deleting uploads in the editor |
   | `GALLERY_VIEW_CODE` | *optional* – set it to require a code just to view; leave unset for public viewing |
   | `GALLERY_QUOTA_GB` | *optional* – default `50` |
   | `GALLERY_MAX_FILE_MB` | *optional* – default `2048` |

4. **Redeploy:** Vercel → Deployments → ⋯ on the latest → **Redeploy** (environment variables only apply to new deployments).
5. Open the site's **Gallery** page and upload a test photo. The first request automatically creates the private `gallery` container and allows browser uploads (CORS) on the storage account.

Recommended extras in the Azure portal:
- **Budget alert:** Cost Management → Budgets → e.g. $5/month with an email alert (Azure has no hard 50 GB stop; the app enforces the quota).
- **Cheaper storage for old files:** storage account → **Data management → Lifecycle management** → rule: base blobs last modified more than 30 days ago → *Move to cool storage*.

### Managing uploads

Editor → **Photo gallery → Manage uploads** → enter the admin code → open or delete any file. Gallery texts, the home-page banner and tips are edited in the same section.

### Local testing

```bash
npm run dev     # http://localhost:3000 — site + gallery API, settings from .env.local
```

`.env.local` (never committed) holds the same variables as Vercel. To test without Azure, run the [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite) emulator and use its development connection string.
