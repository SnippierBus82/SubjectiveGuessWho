# Future iOS and Android packaging

No native projects are implemented. React, game types, and the Supabase service remain reusable in a Capacitor WebView. Local storage/clipboard/share/navigation are isolated in `src/lib/platform.ts`; keep native APIs behind that seam. Online game authority stays in PostgreSQL.

## Add Capacitor later

After reviewing the then-current [Capacitor environment requirements](https://capacitorjs.com/docs/getting-started/environment-setup):

```sh
npm install @capacitor/core
npm install -D @capacitor/cli
npx cap init
npm install @capacitor/ios @capacitor/android
npx cap add ios
npx cap add android
npm run build
npx cap sync
npx cap open ios
npx cap open android
```

Choose your permanent app ID and product name. Set `webDir: 'dist'` in the generated Capacitor configuration; bundle the production web build instead of pointing production at a development server. Supply the public Supabase configuration at build time. Review the wrapper's CSP and origin/network access.

## Native projects, accounts, signing

iOS requires macOS, a supported Xcode/iOS SDK, an Apple Developer team, a registered bundle identifier, signing certificates/provisioning, and an App Store Connect record. Configure minimum iOS version, entitlements, app privacy details, orientation, and release archives. Use TestFlight on actual phones.

Android requires supported Android Studio/SDK/JDK/Gradle versions, a permanent application ID, a Google Play developer account, an upload keystore with secure backup, Play App Signing, and a release Android App Bundle. Check current target/minimum API and testing obligations rather than hardcoding requirements into today's web project.

Never commit signing keys, keystore passwords, certificates, or store upload credentials. Keep account recovery and signing ownership with the product owner.

## Invitations and platform seams

- Keep canonical invitations in the existing `https://YOUR_DOMAIN/?join=CODE` format. Add iOS Associated Domains plus a correctly hosted `apple-app-site-association` file, and Android verified App Links plus `/.well-known/assetlinks.json` for the real package/signing fingerprint.
- Use Capacitor App's URL/open/resume events to parse both cold-start and running-app invitation links and reconcile a canonical snapshot. Validate the room code before joining. Implement the native router adapter without changing game rules.
- Add Clipboard, Share, Keyboard, App, and optional Haptics plugins behind the platform utility. A custom native storage adapter should preserve anonymous sessions safely across reloads; clearing/reinstalling app storage can lose the anonymous identity.
- Reconcile on app resume and network recovery. Timers remain server-authoritative while the OS suspends the WebView. Never run a permanent background timer to keep a game alive.
- Validate Turnstile's mobile/WebView integration and permitted origins before choosing the native CAPTCHA flow. Do not remove production abuse protection to make a wrapper work.

## Artwork and native QA

Create a proper app icon (the current SVG favicon is only a web favicon), adaptive Android foreground/background icons, native launch/splash assets, store screenshots, and marketing artwork. Use Capacitor's documented asset tooling. Review portrait/font/icon licensing and the final game name.

Test touch targets, safe areas/notches, software keyboard resizing and focused input visibility, screen readers (VoiceOver/TalkBack), system text scaling, reduced motion, native back navigation, clipboard/share sheets, offline/reconnect, permission denial, background/suspend/resume, process termination, token refresh, deep links, reinstall/session loss, and two real devices on different networks. Validate both correct and incorrect results, privacy, and rematches. Emulators supplement physical-device tests.

## Submission checks at release time

Provide a real support URL/contact and privacy policy; accurately complete Apple App Privacy and Google Play Data Safety disclosures for Supabase, CAPTCHA, identifiers, and stored questions. Review deletion mechanisms, age rating/content questionnaires, user-generated text obligations, accessibility, encryption/export disclosures, and third-party SDK privacy manifests where applicable. Explain the two-player review flow and supply reviewers an easy way to exercise it.

Check [Apple's current review guidelines](https://developer.apple.com/app-store/review/guidelines/), especially functionality and privacy, and [Google's current target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878) and [new personal-account testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465). Requirements change. A Capacitor wrapper does **not** guarantee approval: the multiplayer game must offer a complete, polished native experience and satisfy the stores' current policies.

Optional improvements after packaging: light haptics on eliminate/answer, native sharing, reliable keyboard insets, app-resume reconnect feedback, and secure session storage. Keep monetization, notifications, native builds, and extra game modes outside this web MVP.
