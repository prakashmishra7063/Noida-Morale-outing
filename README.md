# Microsoft Noida Morale Outing

A dependency-free, responsive static website for GitHub Pages. The site loads all outing information from JSON files in [`data/`](./data), so coordinators can update people and allocations without changing the UI.

## Run locally

Because browsers block `fetch()` from local `file://` pages, serve the folder with any static web server:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Update the outing

- [`data/event.json`](./data/event.json): dates, reporting details, instructions, emergency contact, and schedule.
- [`data/hotel.json`](./data/hotel.json): hotel information, facilities, meals, and booking notes.
- [`data/locations.json`](./data/locations.json): departure and destination addresses and Maps links.
- [`data/employees.json`](./data/employees.json): team members and their technology groups.
- [`data/rooms.json`](./data/rooms.json): room types, capacities, members, and notes.
- [`data/cars.json`](./data/cars.json): cars, drivers, passengers, pickup points, and notes.

Keep names consistent between the employee, room, and car files. The app derives room and car details from those relationships and logs duplicate assignments or capacity issues to the browser console.

## Publish with GitHub Pages

Push the contents of this folder to a GitHub repository, then open **Settings → Pages** and choose **Deploy from a branch**, selecting the default branch and `/ (root)` folder. No build step is required.
