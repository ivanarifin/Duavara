# Privacy

_Last updated: 2026-08-28_

Duavara does not collect analytics data, create accounts, or operate an app backend. The app stores settings, saved locations, prayer caches, worship progress, Quran preferences and downloads, mosque favourites and notes, and Zakat form data locally on your device.

## Store disclosure summary

This document is published for store submission at `https://github.com/ivanarifin/Duavara/blob/main/PRIVACY.md` after the release candidate is committed and pushed. Enter that HTTPS URL in both store consoles.

- **Location:** when a location-dependent feature is requested, the selected or device-provided latitude and longitude are sent to AlAdhan or OpenStreetMap Overpass for functionality. Duavara does not associate this data with an account, use it for tracking, or retain it on an app server. The external provider may process it under its own policy.
- **Search and content requests:** Quran selections, translation or recitation choices, and Quran search terms needed for an opened Quran feature are sent to AlQuran.cloud. Nearby-mosque coordinates are sent to OpenStreetMap Overpass. These requests are not tied to a Duavara account because no account exists.
- **Local-only app data:** saved locations, schedules and caches, worship progress, Tasbih state, Quran bookmarks/progress/downloads, mosque favourites/notes, and Zakat form data remain on the device and are not collected by Duavara.
- **Permissions:** location supports device-based prayer times, Qibla, and mosque search; camera is optional for the camera Qibla view and is not used to create an account or analytics profile; notifications support reminders. Duavara does not sell data or use these permissions for advertising tracking.

For store forms, disclose the requested location and content network transmissions as functionality-related data shared with the named service providers, not as an account-backed Duavara dataset. Confirm the current Apple and Google form wording and the providers' policies at submission time.

## Network requests

When you request a feature, Duavara may transmit the following to public services:

- **AlAdhan:** prayer-time, Qibla, Hijri, and related requests use the selected or device-provided latitude and longitude, plus the requested date and calculation settings.
- **OpenStreetMap Overpass:** nearby-mosque searches use the requested latitude and longitude to find mapped places nearby.
- **AlQuran.cloud:** Quran requests use the surah, translation, recitation, or search selection needed to provide the requested Quran content.

These requests are made only for the requested functionality. Duavara does not sell personal data or use these services for analytics. The services may process requests under their own privacy policies and terms.

## Retention and deletion

Duavara retains app data locally until you use **Prayer settings → Delete all local data** or uninstall the app. This deletes saved places, caches, worship progress, Quran downloads, mosque notes, Zakat data, and scheduled Duavara reminders from the device. Duavara does not retain network request data on its own servers. External services may retain request data under their own policies.
