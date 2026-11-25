# St. Mary of the Assumption: parish website

A modern, bilingual-ready parish website (English, Español, Português) built from the parish logo's navy and gold palette. Staff update the content through a password-protected editor at `/admin`. No code changes are needed for day-to-day updates.

It runs as a small Node.js app on a DigitalOcean droplet, with Caddy in front for automatic HTTPS.

## What the parish can edit (no coding)

Everything is in `/admin`:

| Section | What it controls |
|---|---|
| **Site settings** | Parish name in each language, tagline, welcome message, address, phone, email, office hours, online giving link, social media links, footer note, time zone |
| **Mass & Service Times** | Section (Lord's Day or Weekday Liturgies), day, time, language, place, note. Shown on the home page and the Mass Times page, with Lord's Day and Weekday Liturgies under separate headings |
| **Events** | Title, date, time, location, description, photo, sign-up link. Past events disappear automatically |
| **Announcements** | Message, date, pinned to the top, optional "hide after" date |
| **Ministries & Groups** | Name, description, when it meets, contact person, photo |
| **Staff & Leaders** | Name, role, email, phone, photo |
| **Bulletins** | Upload the weekly PDF with its date. The most recent one is featured on the home page |
| **Home page photos** | Photos that rotate in the main section of the home page |
| **Pages** | Any new page, e.g. "Sacraments" at `/sacraments`. Tick "Show in the main menu" to add it to the menu |

Each text field has three boxes (English, Español, Português). Type English. When automatic translation is on (see below), the Spanish and Portuguese are filled in for you and there are no boxes to type them in. Without a key, the Spanish and Portuguese boxes appear, and anything left blank falls back to English.

Formatting in long text fields uses simple Markdown: blank line between paragraphs, `**bold**`, `*italic*`, `[link text](https://...)`, `## Heading`, and `- bullet points`. Scripts and unsafe HTML are removed automatically.

## Rich text editing

Long text (page content, announcements, event descriptions, the welcome message, office hours) is edited in a visual editor, with a toolbar for headings, bold, italic, underline, links, lists and quotes. Nothing needs to be typed in code. The editor is served by the site itself, so it works without an outside connection.

**To add a photo to page text,** click the photo button in the toolbar, choose a JPG, PNG, WebP or GIF, and describe it for people who can't see it (leave the description blank only if the photo is purely decorative). The photo is placed where the cursor is. Save the page to publish it. Photos can be up to 15 MB; large phone photos are fine, but smaller files load faster.

Content saved from the editor is stored as simple HTML and cleaned on the way out, so scripts and unsafe markup cannot appear on the site. Older pages written in Markdown still display correctly, and the editor shows them as formatted text.

## Automatic translation

Staff type in English. When a record is saved, any blank Spanish or Portuguese box is filled in automatically by [DeepL](https://www.deepl.com/pro-api).

- **Turn it on:** add your DeepL API key to the settings file on the droplet, then restart the site:
  ```bash
  echo 'DEEPL_API_KEY=your-key-here' >> /etc/stmary-site.env
  systemctl restart stmary-site
  ```
  Free-plan keys (ending in `:fx`) are detected automatically. The key stays on the server and is never written into the content files or the code.
- Translations are generated from the English only. They are not editable in the editor, so the English is the single source of text.
- **If the English changes**, an untouched machine translation is redone. A translation someone has edited is kept.
- **If the service is unavailable**, the save still goes through, and the editor shows a message saying which translation failed.
- Without a key, nothing is translated. The English text shows in the other languages until someone types the translation.

Machine translation is a good first draft, not a replacement for a native speaker. Ask someone who speaks Spanish or Portuguese to review important text (such as the Mass times and the welcome message), and fix it by changing the English wording, which is then retranslated.

## Rotating photos on the home page

**Home page photos** in the editor are shown in the main section of the home page. They fade in and out in turn, about every 6 seconds.

- Add as many as you like. Use landscape photos, about 1200 × 900 pixels.
- Set the **Rotation order**. Lower numbers come first.
- Tick **Hide this photo** to take one off the rotation without deleting it.
- Add a **description**, which screen readers read aloud, and an optional **link** that opens when the photo is clicked.
- If there are no visible photos, the parish emblem is shown instead.
- Visitors who have turned on reduced motion see only the first photo, with no animation.

## Design

- Colors are taken from the parish logo: deep navy `#0f2350` and gold `#f2b705`, on white. Change them in `public/css/site.css` (the variables at the top) if the parish wants them adjusted.
- Fonts: a serif for headings (to echo the logo) and the system sans-serif for body text. No external font or tracking requests, so the site is fast and private.
- Accessible: skip link, semantic headings, keyboard focus outlines, alt text for photos, reduced-motion support, and a mobile menu that works without JavaScript.
- Images: `public/img/logo.webp` (header), `public/img/emblem.webp` (hero and footer), `public/img/emblem.png` (browser tab icon).

## Run it on your computer (for testing)

Requires Node.js 20 or newer.

```bash
npm install
ADMIN_PASSWORD='choose-a-long-password' npm start
```

Open http://localhost:3000 for the site and http://localhost:3000/admin/ for the editor (user `admin`, the password you chose).

Run the automated tests with `npm test`.

## Install on a DigitalOcean droplet

1. **Create the droplet.** Ubuntu 24.04 LTS, the smallest size (1 GB RAM is plenty). Add your SSH key.
2. **Point the domain at it.** In your DNS provider, create an `A` record for `stmarymilford.org` (and `www`) pointing to the droplet's IP address. Wait for it to propagate (this can take a few minutes to a few hours).
3. **Copy the project to the droplet** from your computer (replace the IP address):
   ```bash
   scp -r stmary-site root@YOUR.DROPLET.IP:/root/
   ssh root@YOUR.DROPLET.IP
   ```
4. **Run the setup** (on the droplet). Option A and B below both do this:
   ```bash
   cd /root/stmary-site
   DOMAIN=stmarymilford.org ADMIN_EMAIL=you@example.org bash deploy/provision.sh
   ```
   The script installs Node.js, Caddy (HTTPS), and a firewall (SSH, HTTP, HTTPS only). It creates a system service that restarts the site automatically, and a nightly backup of the content. **At the end it prints the admin password. Save it in your password manager.** It is also stored in `/etc/stmary-site.env`.

Your content is stored in `/var/lib/stmary-site/content`, separate from the code. Updating the code never touches it.

### Option A: from the DigitalOcean web console (no command-line tools needed)

Put the project in a GitHub repository first (see below), then in the droplet's web console (you are logged in as root) paste:

Paste this as **one line**. It runs in the background and writes a log, so if the console disconnects the install keeps going:

```bash
curl -fsSL https://raw.githubusercontent.com/OWNER/REPO/main/deploy/bootstrap.sh -o bootstrap.sh && DOMAIN=stmarymilford.org ADMIN_EMAIL=you@example.org CODE_URL=https://github.com/OWNER/REPO/archive/refs/heads/main.tar.gz nohup bash bootstrap.sh > /root/install.log 2>&1 &
```

Then watch progress (reconnect the console first if it dropped):

```bash
tail -f /root/install.log
```

Press Ctrl+C to stop watching; the install continues. When it finishes, the log ends with the admin password. If the console disconnects, reconnect and check with `tail -50 /root/install.log` and `systemctl status stmary-site`.

Replace `OWNER/REPO` with your repository. For a private repository, also add `GITHUB_TOKEN=...` before `bash` (a GitHub token that can read the repository). The script downloads the code, then runs the same setup as Option B. It prints the admin password at the end.

### Option B: from your own computer

Copy the project to the droplet and run the setup (replace the IP address):
```bash
scp -r stmary-site root@YOUR.DROPLET.IP:/root/
ssh root@YOUR.DROPLET.IP
cd /root/stmary-site
DOMAIN=stmarymilford.org ADMIN_EMAIL=you@example.org bash deploy/provision.sh
```

### Putting the project on GitHub

Create a new repository on GitHub (private is fine when you use `GITHUB_TOKEN`). Then, on your computer in the `stmary-site` folder:
```bash
git init -b main
git add .
git commit -m "St. Mary parish website"
git remote add origin https://github.com/OWNER/REPO.git
git push -u origin main
```
The repository must not contain `node_modules` or `content/` (the `.gitignore` in the project already excludes them). Content edits happen in `/admin` on the live site, so they never need to go back to GitHub.

### Updating the code later

Copy the new version to the droplet, then run:
```bash
sudo bash deploy/update.sh
```
The previous version is kept in `/opt/stmary-site.previous` in case you need to roll back.

### Backups

A copy of the content is saved every night to `/var/backups/stmary-site/` and kept for 30 days. Download a copy to your own computer occasionally:
```bash
scp root@YOUR.DROPLET.IP:/var/backups/stmary-site/content-*.tar.gz ./
```

### Useful commands on the droplet

```bash
systemctl status stmary-site        # is the site running?
journalctl -u stmary-site -n 100    # recent log messages
systemctl restart stmary-site       # restart after a settings change in /etc/stmary-site.env
```

## Changing the admin password

Edit `ADMIN_PASSWORD` in `/etc/stmary-site.env` (use at least 12 characters), then run `systemctl restart stmary-site`.

## Project layout

```
server.js            starts the site
src/schema.js        the content model: which sections and fields exist (edit here to add a field)
src/content.js       reads and writes the content files, validation, uploads
src/app.js           routes: public pages, editor API, security headers
src/views.js         the HTML for every public page
src/i18n.js          menu and button labels in each language
src/util.js          Markdown, dates, text helpers
admin/               the content editor (browser app)
public/css/site.css  the design
public/img/          logo and emblem images
seed/                starter content, copied in on first start only
deploy/              droplet setup, updates and the web server configuration
test/                automated tests
```

To add a new kind of content (for example, "Adult Faith Formation classes"), add an entry to `collections` in `src/schema.js` and a list on the home page or in `src/app.js`. The editor builds its forms from the schema automatically.

## Notes for the parish team

- The starter "About Our Parish" page and the welcome message are draft wording. Please review and replace them in `/admin`.
- No Mass times, events, ministries or staff are included yet. Add them in the editor.
- The street address, phone, email and giving link are blank in the starter settings. Fill them in under **Site settings**.
- Keep photos reasonably sized (under a few MB). The site resizes them in the browser, but smaller files load faster.
