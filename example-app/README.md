# Example app

Exercises every method of `@caplugins/capacitor-health` on iOS and Android. Not published to npm.

```bash
npm install
npm run sync      # build the web app and copy it + the plugin into ios/ and android/
npx cap run ios   # or: npx cap run android
```

Rebuild the plugin (`npm run build` in the repo root) before `sync` when you change its TypeScript.
The app id is `com.caplugins.health.example`. iOS has the HealthKit capability and usage strings;
Android declares only the Health Connect permissions the screens use.
