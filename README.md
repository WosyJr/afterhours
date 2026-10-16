# Afterhours

A private site for a gaming friend group, built on top of your Discord server.

People sign in with Discord. Their profile builds itself from their account, their
rank is their highest Discord role, and you decide what each rank can do here.

---

## What you need before you start

A Discord application. Go to <https://discord.com/developers/applications> and
hit **New Application**.

### 1. OAuth2 — so people can sign in

Under **OAuth2**:

- Copy the **Client ID** and **Client Secret**.
- Add a redirect URL. It must match your site exactly:
  - local: `http://localhost:3000/auth/callback`
  - live: `https://your-site.up.railway.app/auth/callback`

Scopes used: `identify` and `guilds.members.read`. You do not need to select
these in the portal — the site asks for them at sign-in.

### 2. Bot — so the site can see presence, voice and channels

Under **Bot**:

- Hit **Reset Token** and copy it. This is the one secret that must never end up
  in the repo.
- Turn **ON** these three toggles:
  - **Presence Intent** — what everyone is playing
  - **Server Members Intent** — the member list and roles
  - **Message Content Intent** — mirroring channel posts

Then invite the bot. Under **OAuth2 → URL Generator**, tick `bot`, give it
**Read Messages/View Channels** and **Read Message History**, and open the URL
it builds.

### 3. Slash commands

Nothing to set up. The bot registers `/quote`, `/tonight`, `/next`, `/live` and
`/deals` plus a **Save as quote** right-click item to your server when it starts,
and again whenever you save Site settings. Guild commands appear instantly.

Leave **Interactions Endpoint URL** in the Developer Portal **blank**. With no
endpoint set, Discord delivers commands down the same websocket the bot already
holds open, so there is no second webhook to host and no request signature to
verify.

### 4. Steam wishlists

Optional, and nothing is needed to try it. Everyone pastes their own profile on
**Play → Deals**. The profile has to be **public** or Steam returns nothing.

Set `STEAM_API_KEY` (from <https://steamcommunity.com/dev/apikey>) if you want
custom profile names like `steamcommunity.com/id/wolfey` to resolve; without it
people need to paste the full `/profiles/<id>` URL or their SteamID64.

Wishlists are re-read every six hours. When something two or more of you want
goes on sale, the bot posts it once in whichever channel you set under **Steam
sale alerts**.

### 5. Twitch and YouTube live detection

**Twitch** — go to <https://dev.twitch.tv/console/apps>, register an application,
and copy the **Client ID** and **Client Secret** into `TWITCH_CLIENT_ID` and
`TWITCH_CLIENT_SECRET`. Nobody has to log in with Twitch; the site uses an app
token it fetches itself. Twitch gives the stream title, game, viewer count,
uptime and thumbnail.

**YouTube** — nothing to set up. The site reads each linked channel's own
`/live` page, which is free and unmetered. It gives you the title, the thumbnail
and the video to embed, but **no viewer count**.

If you would rather use the official Data API, set `YOUTUBE_API_KEY`. Be warned:
a live search costs 100 quota units against a 10,000/day budget, which works out
at roughly 100 checks a day for the whole site. With a handful of channels polled
every minute you will blow through that before lunch, so the free check is
usually the right call.

Everyone links their own channels on their profile page.

### 6. Your server's ID

In Discord, turn on **Settings → Advanced → Developer Mode**, then right-click
your server and **Copy Server ID**.

---

## Environment variables

Copy `.env.example` and fill it in. On Railway these go in **Variables** — type
them straight in there, never into a file you commit.

| Variable | What it is |
| --- | --- |
| `DISCORD_CLIENT_ID` | From OAuth2 |
| `DISCORD_CLIENT_SECRET` | From OAuth2 |
| `DISCORD_BOT_TOKEN` | From Bot → Reset Token |
| `DISCORD_GUILD_ID` | Your server ID |
| `SITE_URL` | Full public URL, no trailing slash |
| `TWITCH_CLIENT_ID` | From dev.twitch.tv. Optional, but Twitch detection needs it |
| `TWITCH_CLIENT_SECRET` | Same place |
| `YOUTUBE_API_KEY` | Optional. Blank uses the free page check |
| `STEAM_API_KEY` | Optional. Only needed to resolve custom Steam profile names |
| `STEAM_COUNTRY` | Optional. Two-letter country for Steam prices. Defaults to `us` |
| `STEAM_POLL_MS` | Optional. Defaults to 21600000, six hours |
| `STREAM_POLL_MS` | Optional. Defaults to 60000 |
| `STATS_TICK_MS` | Optional. Defaults to 60000 |
| `SESSION_SECRET` | Any long random string |
| `PORT` | Railway sets this itself |
| `DATA_DIR` | Optional. Defaults to `./data` |

---

## Running it

```
npm install
npm start
```

Then open <http://localhost:3000>.

**The first person to sign in becomes the owner.** Make sure that's you. The
owner always keeps every permission and can never be locked out.

---

## The five tabs

| Tab | Panes |
| --- | --- |
| **Home** | The hero, who's online, what's open tonight, voice, the next night |
| **Crew** | People, Stats, Ranks |
| **Clips** | Media, Memories, Live |
| **Play** | Nights, Library, Deals |
| **Settings** | Site, Permissions, Discord — only shown to ranks that can manage the site |

Old addresses from the eleven-tab version (`/profiles`, `/memories`, `/events`
and the rest) redirect to wherever they live now, so any link already shared
still works.

---

## Setting it up once you're in

Open **Settings → Permissions** (owner only).

- **Server roles** down the left are read from Discord — names, colours and
  ordering. You can't edit them here; change them in Discord and they change here.
- Pick a role and toggle what it can do on the site. The highest role in your
  server keeps everything and can't be switched off.
- Someone with several roles gets everything all of them allow, the same way
  Discord treats its own permissions.
- **Settings → Site** sets the name, tagline, hero headline and sub-line, your
  invite link, and every channel the bot posts to: mirrored channels, go-live
  announcements, game-night announcements, Steam sale alerts and achievements.

### Going live

Set **Channel for go-live announcements** in Site settings and the bot posts
there the moment someone starts streaming — once per stream, not once per poll.

A live stream shows in four places: a red bar across the top of every page, a
card on Home, **Clips → Live** with an inline player, and a badge beside that
person's name on Right now.

Twitch embeds only play on a domain you have whitelisted, which the site handles
by passing your `SITE_URL` hostname as the `parent` parameter. If the player
shows a blank box, that is almost always `SITE_URL` not matching the domain you
are actually on.

### Mirrored channels

Two channels feed the site:

- **Clips → Media** — everything posted shows up, with attachments and reactions.
  Video attachments play in place rather than showing a broken image.
- **Clips → Memories** — only posts reacted to with 📌 are kept. Take the pin off
  and the post drops out.

Pinning works from either end. React with 📌 in Discord, use **Save as quote** on
a message there, or press **Pin** on the site — the site reacts as the bot, so
the pin exists in Discord too and survives a restart.

The bot backfills the last 50 messages when you point it at a channel, then keeps
up live.

---

## Deploying to Railway

1. Push this folder to a GitHub repo. `data/` and `.env` are gitignored already.
2. New Project → Deploy from GitHub repo.
3. Add the variables from the table above under **Variables**.
4. Railway gives you a domain — put it in `SITE_URL`, and add
   `https://that-domain/auth/callback` to your Discord redirect URLs.

### A note on storage

Data is JSON files in `DATA_DIR`. Railway's filesystem is wiped on redeploy, so
attach a **Volume** mounted at `/data` and set `DATA_DIR=/data` to keep profiles,
permissions and settings between deploys.

Pictures and video are written as real files under `DATA_DIR/uploads` and served
from `/uploads`, so they live on the same Volume as everything else. One file per
slot: replacing the hero deletes the old one, so the folder cannot grow forever.
Stills are capped at 12MB, video at 64MB.

---

## The Jukebox

Shared music, ported from the Bard's corner on the Bruma site.

A small player sits bottom-left on every page and plays right there. Because
each tab on the site is a fresh page load, it saves where it got to and picks up
from the same second on the next page — a short gap, not a restart.

For gapless listening, the **pop-out** button moves the music into its own small
window, which the navigation never touches. The inline player stands down the
moment that window appears, so you never get two at once. The two halves talk
over a BroadcastChannel with a localStorage heartbeat as backup, so the mini bar
always shows what is actually playing and its buttons drive whichever player is
live.

### YouTube and YouTube Music

Both work, and they share video and playlist ids underneath, so a link copied
from either one is fine. Single tracks, albums (`OLAK5uy_…`) and curated
playlists (`RDCLAK5uy_…`) all play.

Two shapes can never play, and the site names them rather than failing quietly:

- **An album browse page** (`music.youtube.com/browse/MPREb_…`) is not a list at
  all. Open the album, press **Share**, and paste that link instead.
- **A radio or mix** (`…&list=RDAMVM…`) is generated for one listener and refuses
  to embed. If the link also names a track, the track is kept and the mix is
  dropped; if it is only a mix, it is rejected.

If a track inside a playlist turns out to be blocked from off-site embedding,
the player retries it on its own before moving past it.

### Starting on its own

**Settings → Site → How the music starts** has a starting volume and a switch
for beginning the house list when someone opens the site.

Be aware of what no website can do: **browsers refuse to play sound until the
person has clicked something on the page.** There is no way around it. So with
the switch on, the first track is loaded and queued at the chosen volume the
moment the page opens, and begins on the very first click or keypress anywhere
on the site — usually whatever they were going to click anyway. Until then the
play button shows amber.

Whoever pauses it stays paused in their own browser, across page loads, until
they press play again. The setting is a default for the server, not something
imposed on each person every time they load a page.

Two lists:

- **The house list** — shared, set in **Settings → Site → Jukebox** by anyone
  with `members`. One per line: a name, a bar, then a YouTube link. Playlist
  links work as well as single tracks.
- **Yours** — paste any YouTube link. These live in your own browser only;
  nobody else sees or hears them.

Volume, the track you were on and how far through it you were all persist, so
closing the window and opening it again picks up where you left off.

It is a YouTube player underneath, through `youtube-nocookie.com`. A track that
the uploader has blocked from off-site embedding will skip itself after a moment
rather than sitting there silent.

On phones the mini bar moves above the bottom tab bar. Pop-up windows are
awkward on mobile, so if the browser blocks it the player says so and tells you
what to allow.

---

## Permissions reference

| Key | What it allows |
| --- | --- |
| `view` | Open the site at all |
| `react` | React to media |
| `post` | Post clips, or have mirrored posts kept |
| `session` | Open a looking-to-play slot |
| `event` | Create and lock game nights |
| `pin` | Promote a post to Memories |
| `images` | Replace hero, banners and card artwork |
| `members` | Edit profiles, set mirrored channels |
| `purge` | Delete other people's content |
| `roles` | Open Permissions and change all of the above |

New roles added in Discord are picked up automatically and seeded sensibly:
the top role gets everything, the next few get a moderator-ish set, the rest get
a member set. Nothing that touches other people's content is granted silently.

---

## Layout

```
server.js            routes and wiring
lib/store.js         JSON persistence
lib/discord.js       OAuth2 and REST calls
lib/gateway.js       the bot's websocket: presence, voice, mirroring, interactions
lib/commands.js      slash commands and the right-click item
lib/music.js         the Jukebox: house list, YouTube link parsing, the window
lib/perms.js         role to permission resolution
lib/stats.js         sampled voice, game and co-presence time
lib/achievements.js  the eight badges and the sweep that awards them
lib/steam.js         wishlists, prices, overlap and sale alerts
lib/streams.js       Twitch and YouTube live checking
lib/streampages.js   the live bar, the Live pane and the profile channel block
lib/uploads.js       pictures and video on disk
lib/views.js         page shell, five-tab nav and shared components
lib/pages.js         each tab's panes
public/style.css     all styling
public/app.js        client side: joins, votes, uploads, pinning, live refresh
public/jukecore.js   shared by both players: link parsing, the YouTube API
public/music.js      the mini player, and the inline one it drives
public/musicwin.js   the Jukebox window itself
```

---

## How the numbers are worked out

Everything on **Crew → Stats** is sampled once a minute from what the bot can
see, rather than built from an event log. Being in a voice channel for a minute
is a minute; being in it with someone else is a minute together; whatever Discord
says you are playing is a minute on that game. Sampling survives restarts, missed
events and the bot being down, which a ledger of events does not.

Nights and hosting come from locking a night in on **Play → Nights**. A streak
counts nights in a row; missing one, or a gap of more than three weeks, resets it.

Achievements are checked every ten minutes. When there is a channel set for them,
at most one per person is awarded per sweep, so switching the feature on does not
dump eight messages into the channel at once — the rest arrive over the following
sweeps, each with its own post.
