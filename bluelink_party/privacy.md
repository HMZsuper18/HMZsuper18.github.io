# Privacy Policy for BlueLink Party

**Last updated:** September 16, 2026

BlueLink Party ("the app") is a local Wi-Fi multiplayer party game built with Flutter. This privacy policy explains what data is collected, how it is used, and your rights regarding that data.

## 1. Overview

The app is designed for local multiplayer over Wi-Fi. All networking happens on your local Wi-Fi network — no data is sent to any internet server. The app has no backend, no cloud services, and no analytics.

## 2. Data We Collect

### 2.1 Locally Stored Data

The only data stored on your device is:

- **Player display name**: A name you choose (max 16 characters), saved in local SharedPreferences. This never leaves your device unless you join a local multiplayer room.

### 2.2 Ephemeral Data (Not Stored)

The following data exists only in memory during a play session and is **never persisted**:

- **Player ID**: A random 8-character identifier regenerated on every app launch
- **Wi-Fi SSID and signal strength**: Read from your Wi-Fi connection to display the network name in the lobby. Never saved.
- **Game input data**: Joystick position, button presses, and game actions sent over local UDP to other devices on the same Wi-Fi network

### 2.3 Local Network Communication

When you host or join a multiplayer room, the app communicates over local UDP (Wi-Fi multicast) with other devices on the same network. This includes:

- Player names and team assignments
- Game input (movement, actions)
- Game state updates (positions, scores, match results)

**None of this data leaves your local Wi-Fi network.** There is no internet endpoint, no cloud server, and no data transmission beyond your local subnet.

## 3. Permissions

| Permission | Purpose | Data Collected |
|---|---|---|
| **ACCESS_FINE_LOCATION / ACCESS_COARSE_LOCATION** | Read Wi-Fi network name (SSID) on Android 8.1–12 | Wi-Fi SSID displayed in lobby only; never stored or transmitted |
| **NEARBY_WIFI_DEVICES** | Read Wi-Fi network name (SSID) on Android 13+ | Same as above |
| **INTERNET** | Local UDP multiplayer sockets | Local network traffic only |
| **ACCESS_WIFI_STATE** | Read Wi-Fi connection status | Connection status for lobby display |
| **CHANGE_WIFI_MULTICAST_STATE** | Receive UDP broadcast discovery packets | Enables host discovery on local network |

Location permissions are requested solely to read the Wi-Fi SSID. The app does not collect or use geolocation data. If permissions are denied, the app displays "Unknown Wi-Fi" and continues to function normally.

## 4. Third-Party Libraries

The following libraries are used:

- **flutter_bloc**: State management; no network calls
- **equatable**: Value equality; no network calls
- **shared_preferences**: Local key-value storage for player name only
- **permission_handler**: Requests OS permissions at startup
- **audioplayers**: Local audio playback of procedural sound effects
- **package_info_plus**: Reads app version for the About screen
- **url_launcher**: Opens the developer's portfolio and email links in the browser

**No advertising SDKs, analytics frameworks, crash reporting tools, or third-party data collection services are used.**

## 5. Data Retention

- **Player name**: Retained until you change it or uninstall the app
- **All other data**: Ephemeral — exists only during a play session and is discarded when the app closes or the match ends

## 6. Your Rights

Because all data is stored locally on your device, you have full control:

- You can change your player name at any time in the app
- You can clear app data via your device settings to remove the stored player name
- You can revoke location permission at any time; the app will display "Unknown Wi-Fi" instead of the network name
- You can uninstall the app to remove all data

## 7. Children's Privacy

The app is designed for all ages and does not knowingly collect any data from children under 13. No parental consent mechanisms are required because no personal data is collected.

## 8. Changes to This Policy

We may update this privacy policy from time to time. We will notify users of any changes by updating the "Last updated" date. You are advised to review this policy periodically for any changes.

## 9. Contact

If you have any questions or suggestions about our privacy policy, please contact us at:

**hamzah.arkoub@gmail.com**

---

**Generated for the BlueLink Party app (GPLv3 license). This is a static document — no tracking or data collection mechanisms are included.**
