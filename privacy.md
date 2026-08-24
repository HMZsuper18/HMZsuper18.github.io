# Privacy Policy for Bayan

**Last updated:** August 24, 2026

Bayan ("the app") is an offline-first Quranic study application built with Flutter. This privacy policy explains what data is collected, how it is used, and your rights regarding that data.

## 1. Overview

The app is designed to work entirely offline. No user data is transmitted to any server unless you explicitly initiate an action that requires network access. We respect your privacy and minimize data collection to only what is necessary for core functionality.

## 2. Data We Collect

### 2.1 Locally Stored Data (Hive Boxes)

All of the following data is stored **locally on your device** in encrypted Hive databases and is never transmitted unless you explicitly choose to share it:

- **Surahs and verses**: Quran text, translations, and tafseer
- **Reciters**: Downloaded audio recitations you choose
- **Bookmarks**: Your marked verses for later reference
- **Settings**: Your preferred fonts, UI language, theme (light/dark), layout preferences, and prayer time location coordinates (saved with timestamps for a 3-day refresh cycle)
- **Qiraat**: Available recitation modes

### 2.2 Ayah of Week

The "Ayah of the Week" feature uses a purely algorithmic FNV-1a hash based on the ISO week number. **No user data is collected or stored** for this feature.

### 2.3 OCR (Page Scanner)

When you use the camera to scan pages:
- Images are processed locally on your device
- Temporary image files are deleted immediately after processing
- No scan images are transmitted to any server

### 2.4 User-Initiated Network Requests

The only network calls made by the app are:
- **Audio recitation downloads** from `api.quran.com` — these occur **only when you explicitly download** a reciter
- **Prayer times** — geolocation data is used to determine prayer times, with a fallback to hardcoded Makkah coordinates if you deny location permission

## 3. Permissions

| Permission | Purpose | Data Collected |
|---|---|---|
| **CAMERA** | OCR page scanning | Images processed locally only |
| **ACCESS_FINE_LOCATION / ACCESS_COARSE_LOCATION** | Prayer times calculation | Location coordinates stored locally in settings box (with 3-day refresh cycle), fallback to Makkah coordinates if denied |
| **INTERNET** | Standard Flutter requirement | Enables user-initiated audio downloads from api.quran.com |

## 4. Third-Party Libraries

The following libraries are used, and their data practices are:

- **just_audio**: Plays audio locally from downloaded files; no background collection
- **dio**: Makes network calls **only** for user-initiated reciter audio downloads from `api.quran.com`
- **geolocator**: Requests location permission for prayer times; data stays on device
- **flutter_tesseract_ocr**: OCR processed locally; no network transmission
- **share_plus, url_launcher**: Used only when you explicitly share or launch external URLs
- **home_widget**: Widget updates are configured by you; no autonomous data collection

**No advertising SDKs, analytics frameworks, or crash reporting tools are bundled in this app.**

## 5. Data Retention

- **Local data**: Retained indefinitely until you uninstall the app or clear app data
- **Location coordinates**: Refresh cycle of 3 days; if no new location is granted, falls back to Makkah coordinates
- **Downloaded audio**: Retained until you manually delete it

## 6. Your Rights

Because all data is stored locally on your device, you have full control:

- You can clear app data via your device settings, which will remove all locally stored Hive data
- You can revoke location permission at any time; the app will fallback to Makkah coordinates for prayer times
- You can manually delete downloaded recitations
- You can export or delete your data through your device's app management settings

## 7. Children's Privacy

The app is designed for all ages and does not knowingly collect any data from children under 13. No parental consent mechanisms are required because no personal data is collected.

## 8. Changes to This Policy

We may update this privacy policy from time to time. We will notify users of any changes by updating the "Last updated" date. You are advised to review this policy periodically for any changes.

## 9. Contact

If you have any questions or suggestions about our privacy policy, please contact us at:

**hamzah.arkoub@gmail.com**

---

**Generated for the Bayan Quran app (GPLv3 license). This is a static document — no tracking or data collection mechanisms are included.**