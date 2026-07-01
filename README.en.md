# 🦖 PortPilot

[Türkçe](README.md) · **English**

![version](https://img.shields.io/badge/version-v1.2-2563eb) ![node](https://img.shields.io/badge/node-%3E%3D18-339933) ![license](https://img.shields.io/badge/license-MIT-555)

A cross-platform tool (macOS · Windows · Linux) that connects to remote servers over **SFTP, FTP or FTPS** and lets you manage files from your browser or a desktop app, just like Windows File Explorer. On top of that it adds **Docker management**, **server tools** (cron · users · services · ports · SSH keys), a **dual-pane (FileZilla-style) view**, an **audit log** and a **dark theme**.

> Pick the protocol on the connection screen (SFTP / FTP / FTPS) and enter any port you like.
> Command-based features such as Docker, server tools, disk analysis and `.tar.gz` downloads only work over SFTP (SSH) connections.
> No credentials are ever sent to the internet; everything runs on your own machine.

---

## 📸 Screenshots

> The images below were taken with **demo (sample) data** — they contain no real servers or credentials.

### Connection screen
Protocol selection, password or SSH key, one-click connect to saved servers organized in groups; import from FileZilla.

![Connection screen](screenshots/01-login.png)

### File Explorer
Desktop-style icon view, file icons by type, favorites in the sidebar, quick access and disk usage.

![File Explorer](screenshots/02-explorer.png)

### Server Dashboard
CPU / RAM / disk, system information and load summary right after connecting.

![Server Dashboard](screenshots/11-dashboard.png)

### Dual pane (split-pane)
Open two servers side by side and transfer selected files directly with **Left ➡ Right / Left ⬅ Right** (FileZilla-style).

![Dual pane](screenshots/05-dual-pane.png)

### Dark theme
One-click dark/light theme; your choice is remembered.

![Dark theme](screenshots/04-dark.png)

### Docker management & Compose
Start/stop/remove containers, live CPU·RAM, logs; stack-based up/down/restart/pull in the **Compose** tab.

![Docker management](screenshots/03-docker.png)

![Docker Compose](screenshots/06-compose.png)

### Server tools (cron / users / SSH …)
Open ports, processes, services, **cron**, **users & groups**, **SSH keys**, disk analysis and logs.

![Cron](screenshots/08-cron.png)

### Audit log
Timestamped record of connections and file operations.

![Audit log](screenshots/10-audit.png)

---

## ✨ Features

### 📁 File management
- **Two views:** desktop-style **icon (grid)** and detailed **list** — your preference is remembered
- **Column sorting:** click the Name / Modified / Type / Size header; folders always first
- Folder browsing, breadcrumb address bar, back / up / refresh, **recursive search**
- **Drag-and-drop** upload of **files and folders** — folders keep their subfolder structure
- **Transfer queue:** many uploads are queued (pause/resume), **parallel + streaming** — no RAM bloat
- **Transfer options (FileZilla-style):** conflict behavior — **Overwrite · Skip · Keep both** + parallel count
- **Download:** single file, folder (`.tar.gz`), **select multiple into one archive**, or **drag onto the desktop**
- **Drag-to-download · archive/extract (tar.gz/zip) · batch rename (regex/sequential, live preview)**
- **Copy / Cut / Paste**, new folder, rename / move, recursive delete (progress bar)
- **Permissions (chmod)** and a **Properties** panel (owner/group, octal + symbolic permissions, recursive size)
- **Preview:** view images and PDFs in a window without downloading · **built-in text editor** (`Ctrl/Cmd+S`)
- **Edit in an external app (desktop):** open a file in your default app (VS Code/Sublime/Preview…) → **it is automatically uploaded back to the server on every save** (FileZilla-style)
- **Server-to-server transfer** and **dual pane (split-pane):** open two servers — or **this computer (local ↔ server, on desktop)** — side by side and transfer between them
- **Favorites**, quick access and a **disk usage** indicator in the left sidebar

### 🐳 Docker management
- List containers; **start · stop · pause · restart · remove**, **live CPU/RAM**, **log viewer**
- **Docker Compose:** stack (project) based view — **up / down / restart / stop / pull**
- **Idle / stale container** analysis and **prune** (stopped containers / dangling images cleanup)
- **Image** listing and removal

### 🧰 Server tools (SFTP/SSH only)
- **Open ports** (listening TCP/UDP + process), **processes** (top CPU + kill), **systemd services** (start/stop/restart)
- **Disk analysis** (per-folder with `du`, ratio bars), **log tailing**
- **Cron management** (read/edit/save crontab) + **scan every cron on the server** (`/etc/crontab`, `cron.d`, other users, periodic scripts, **systemd timers** — with human-readable schedule descriptions)
- **SSH tunnel** (local port forwarding): securely bring a service on the server's network to `localhost:port` — one-click tunnel for a DB/internal panel, with a live traffic indicator
- **Web server (Nginx / Apache):** list sites/vhosts, **enable/disable**, **test** the config (`nginx -t`), **reload/restart**, open a vhost in the editor
- **Firewall (ufw):** view numbered rules, **allow/deny**, delete a rule, enable/disable
- **Users & groups** listing + **chown**
- **Generate & install an SSH key** (ed25519 → `authorized_keys`, hands you the private key for passwordless login)

### 🔐 Connection & security
- **SFTP / FTP / FTPS**; **password** or **SSH private key** (key only on SFTP)
- **Jump Host / Bastion:** connect to the target through an intermediate server (ProxyJump) — separate credentials for the bastion, stored encrypted on saved servers (SFTP only)
- **Command palette (Cmd/Ctrl+K):** a fast, searchable list of every action and of connecting to saved servers
- **Saved servers:** save, organize into groups, connect with one click; **edit with ✎** (update host/port/user without deleting)
- **Encrypted storage:** passwords/keys are encrypted with the OS keychain (Electron `safeStorage`) — `servers.json` never holds plaintext passwords
- **App lock:** master password (scrypt + salt), auto-lock, **Touch ID** on macOS
- **Session resilience:** transparent **auto-reconnect** if SFTP/SSH drops; credentials kept in memory only, encrypted with **AES-256-GCM** (keep-alive + auto-reconnect)
- **Audit log:** timestamped record of connections and file operations (delete/move/copy/rename/archive/transfer)
- Idle sessions close automatically

### 🎨 Experience
- **Command helper (cheat-sheet):** the **"📋 Commands"** button in the Terminal and Docker panels opens a categorized, searchable, bilingual list of ready-made commands (~75) — click to drop one onto the command line
- **Dark / light theme** (persistent, follows the system preference)
- **Language option (Turkish / English)** — persistent, follows the browser language on first launch
- **Server dashboard:** live **sparkline history charts** for CPU / RAM / disk + **90% threshold notifications** (desktop)
- Multi-server **tabs**, a "What's new?" release-notes panel, a real-time version badge

---

## 🚀 Installation

Requirement: **Node.js 18+**

```bash
git clone https://github.com/serkancakmakk/PortPilot.git
cd PortPilot
npm install
npm start
```

Open **http://localhost:3000** in your browser.

| Command | Description |
|---------|-------------|
| `npm start` | Starts the web server (browser) |
| `npm run dev` | Development mode with auto-restart |
| `PORT=8080 npm start` | Runs on a different port |
| `npm run app` | Runs in a desktop (Electron) window |

---

## 🖥️ Desktop app (Mac · Windows · Linux)

Besides the web tool, PortPilot can also be packaged as a **cross-platform desktop app**
(Electron). You **build the installers yourself on your own machine** — no prebuilt binaries are shipped in the repo.

```bash
npm install          # dependencies including electron + electron-builder
npm run dist         # builds for your current OS
```

For specific platforms:

| Command | Output (into `dist/`) |
|---------|-----------------------|
| `npm run dist:mac` | `.dmg` (Intel + Apple Silicon) and `.zip` |
| `npm run dist:win` | `Setup .exe` (installer) and portable `.exe` |
| `npm run dist:linux` | `.AppImage`, `.deb`, `.rpm`, `.pacman` (x64 + arm64) |
| `npm run dist` | Everything for the current OS |

> **Note:** the Windows build can be produced on macOS/Linux via electron-builder's bundled wine.
> macOS targets can only be produced on macOS. Linux `.rpm` needs `rpmbuild`, and `.pacman` needs
> `bsdtar` (libarchive-tools) + `zstd`; these are installed automatically in CI (Ubuntu).

### Linux distribution — which package for whom?

| Distro | File | Install |
|--------|------|---------|
| **CachyOS / Arch / Manjaro** | `.pacman` | `sudo pacman -U PortPilot-*-x86_64.pacman` |
| **Ubuntu / Debian** | `.deb` | `sudo apt install ./PortPilot_*_amd64.deb` |
| **Fedora / RHEL / openSUSE** | `.rpm` | `sudo dnf install ./PortPilot-*.x86_64.rpm` |
| **Any distro (no install)** | `.AppImage` | `chmod +x *.AppImage && ./*.AppImage` |

> AppImage needs FUSE2; on Arch-based distros run `sudo pacman -S fuse2` or use
> `./*.AppImage --appimage-extract-and-run`.

#### 🔁 Auto-updating pacman repo for CachyOS / Arch (recommended)

No AUR needed. On every release, CI turns the x86_64 pacman package into a repository and publishes it
in the `arch-repo` release. The user adds this to the end of `/etc/pacman.conf` **once**:

```ini
[portpilot]
SigLevel = Optional TrustAll
Server = https://github.com/serkancakmakk/PortPilot/releases/download/arch-repo
```

Then installs it and stays up to date automatically with normal system upgrades:

```sh
sudo pacman -Sy portpilot     # install
sudo pacman -Syu                # update (new versions arrive automatically)
```

### Download from the web (for users)
While the web interface (`npm start`) is running, the **"💻 Download the desktop app"** button on the login
screen lets users download the installer **for their own OS** (detected automatically).
This list reads the `dist/` folder on the server — so `npm run dist` must have been run (or `dist/` copied)
**on the machine hosting the web server**.

> The `dist/` folder is excluded via `.gitignore`; binaries bloat the repo.
> If you want to distribute prebuilt installers, upload them to **GitHub Releases** (not the git history).

---

## 📖 Usage

1. **Connect:** enter the server address, port (default 22) and username; authenticate with a password or SSH key.
2. **Browse:** double-click a folder; text files open in the editor, others are downloaded.
3. **Upload:** drag a file or **folder** onto the window (or use the Upload / Upload Folder buttons). In the **transfer options** dialog that appears, choose the conflict behavior (overwrite / skip / rename) and the parallel count.
4. **Download:** select an item and press ⬇ Download; or check multiple and download a single `.tar.gz`.
5. **Docker:** manage containers via **🐳 Docker Management** in the left menu; watch **CPU/RAM** usage live.
6. **Save:** make a connection permanent with "Save this server" on the login screen.

### Keyboard shortcuts
| Key | Action |
|-----|--------|
| `F2` | Rename (selected item) |
| `F5` | Refresh |
| `Delete` | Delete (selected item) |
| `Backspace` | Parent folder |
| `Ctrl/Cmd + S` | Save in the editor |
| `Esc` | Close the editor/panel |

---

## 🛠 Technologies

- **Backend:** Node.js · [Express](https://expressjs.com/) · [ssh2](https://github.com/mscdex/ssh2) (SFTP + exec) · [basic-ftp](https://github.com/patrickjuchli/basic-ftp) · [multer](https://github.com/expressjs/multer) · [ws](https://github.com/websockets/ws) (terminal)
- **Desktop:** [Electron](https://www.electronjs.org/) + electron-builder (+ electron-updater auto-update)
- **Frontend:** plain, modular HTML/CSS/JavaScript (no framework) · [xterm.js](https://xtermjs.org/) terminal

## 📂 Project structure

```
.
├── server.js          # Express app + server startup
├── electron/          # Desktop (Electron) main process + preload
├── routes/            # API endpoints: connect, files, docker, sys, servers, prefs, lock, audit…
├── lib/               # remote-fs (SSH/SFTP), sessions, uploads, servers-store, audit…
├── public/
│   ├── index.html     # UI skeleton
│   ├── style.css      # Design (Fluent/Win11-inspired) + dark theme
│   └── js/            # Modular client (explorer, docker, systools, dual-pane, audit, theme…)
├── package.json
└── README.md
```

---

## 🔒 Security notes

- Credentials are kept in memory only for the active connection; nothing is sent over the network except SFTP operations.
- **Saved server passwords/keys are stored encrypted:** they are encrypted with a key derived from the OS keychain (Electron `safeStorage`) and written to `servers.json` — no plaintext passwords are kept. (In an environment without a keychain it falls back to plaintext; that file is still excluded via `.gitignore` — do not share it.)
- The **app lock** can prompt for a master password on launch (hashed on-device with scrypt + salt).
- The tool is designed for a local/trusted network. If you expose it to the internet, put **HTTPS (a reverse proxy)** and an **authentication layer** in front of it.

---

## 📄 License

MIT
