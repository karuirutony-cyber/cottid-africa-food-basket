# Africa Food Basket Platform — Cottid Africa

The platform page, connected to Firebase project `cottid-72d51`: Google and email sign-in, user profiles with roles, saved views, correction suggestions with a review queue, a launch sign-up list, and a live directory that published records update without a rebuild.

## Folder

| Path | What it is |
|---|---|
| `base/` | **Put the platform page here** (the latest `cottid_africa_food_basket_platform.html`). |
| `firebase/src/fire.js` | Sign-in, profiles, saved views, corrections, review queue, live directory. |
| `firebase/firestore.rules` | Who can read and write what. |
| `firebase/tools/` | Page build, database seed, role assignment. |
| `public/` | Built site that gets published (generated). |

## One-time setup (Windows, in this folder)

1. Install **Node.js LTS** from nodejs.org.
2. Open a terminal in this folder and run:
   ```
   npm install
   npx firebase login
   ```
3. Firebase console → **Firestore Database**: create the database (region **africa-south1**, production mode) if not done yet.
4. Firebase console → **Authentication → Settings → Authorised domains**: `localhost` and `cottid-72d51.web.app` should be listed. Add your own domain later.
5. Firebase console → **Project settings → Service accounts → Generate new private key**. Save it in this folder as `serviceAccount.json`. It is ignored by git — never share it.

## Build and publish

```
npm run deploy        # builds the page, publishes rules, indexes and the site
npm run seed          # fills the public collections from the page's data
```

The site goes live at **https://cottid-72d51.web.app**.

## Publish on Vercel (main site)

Vercel builds from GitHub on every push, using `vercel.json`.

1. vercel.com → **Add New → Project → Import** `karuirutony-cyber/cottid-africa-food-basket`. Leave the build settings as they are and choose **Deploy**.
2. Firebase console → **Authentication → Settings → Authorised domains** → add the Vercel address (e.g. `cottid-africa-food-basket.vercel.app`) and any custom domain. Without this, Google sign-in is refused there.
3. Rules and indexes still go to Firebase: `npx firebase deploy --only firestore`.

## Make yourself admin

Sign in on the live site once (Google or email), then:

```
npm run make-admin -- your@email.com
```

Roles, lowest to highest: member, contributor, verifier, content_editor, data_steward, platform_admin, super_admin. Verifiers and above see the review queue.

## Collections

Created automatically — nothing to set up by hand:

| Collection | Created when |
|---|---|
| `users/{uid}` | A person signs in for the first time (role `member`). |
| `users/{uid}/saved` | They save a view. |
| `submissions` | Someone suggests a correction. |
| `auditLog` | A reviewer approves or rejects. |
| `signups` | Someone joins the launch list (any form with `data-afb-signup`). |
| `published_calls`, `published_events`, `published_buyers`, `meta` | `npm run seed`. Only verified buyers are published. |

## Try it locally

```
npm run serve         # http://localhost:5000
```

© Cottid Africa.
