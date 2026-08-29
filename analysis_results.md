# SafeHer (SafeTransit AI) - Project Analysis Report

SafeHer (SafeTransit AI) is a React Native Expo application designed to map and monitor travel safety. The application has specific customizations optimizing it for the Chennai/Tamil Nadu region, using multi-tier API fallbacks to bypass browser-specific CORS constraints on the web prototype.

---

## 1. Project Directory Structure

Below is an overview of the key folders and files in the repository:

```
project/
├── .env                    # Environment variables (e.g. Mapbox token)
├── app.json                # Expo project and dependency definitions
├── package.json            # Scripts, Expo Native, and Leaflet dependencies
├── test_headers.js         # Script testing OSRM direct HTTP headers
├── test_route.js           # Multi-tier route provider test utility
├── app/                    # Expo Router View & Screens
│   ├── +not-found.jsx      # Fallback page for unmatched routing
│   ├── _layout.jsx         # Root router entrypoint & auth redirect controller
│   ├── auth.jsx            # Citizen vs. Government login/register screen
│   ├── edit-profile.jsx    # Home/Work location and emergency contact settings
│   ├── gov.jsx             # Government Official dashboard
│   └── (tabs)/             # Citizen Dashboard Screens (bottom navigation)
│       ├── _layout.jsx     # Navigation options and icons for tabs
│       ├── index.jsx       # Home / SOS page with live safety score preview
│       ├── journey.jsx     # Live GPS tracking monitor & ETA timeline
│       ├── profile.jsx     # User details & settings overview
│       ├── report.jsx      # Anonymous community safety issue logging
│       └── routes.jsx      # Path planning interface with Leaflet map
├── components/             # Reusable UI & custom map widgets
│   ├── RouteMap.jsx        # Mobile Map placeholder
│   ├── RouteMap.web.jsx    # Complete React-Leaflet tiles, marker & polyline renderer
│   ├── safetyScore.jsx     # Styled view displaying safety status
│   └── ui.jsx              # Unified CSS tokens, pills, buttons, and layouts
└── lib/                    # Core application libraries
    ├── auth.js             # Simulated session & user manager
    ├── localReports.js     # localstorage reporting persistence broker
    └── location.js         # Geolocation coordinates, geocoding & route finding
```

---

## 2. Technical Stack and Configuration

### Core Infrastructure
- **Framework**: `Expo (version ~57.0.16)` powered by `React Native (0.86.2)` and `React 19.2.3`.
- **Target Platforms**: Android, iOS (using React Native components) and **Web** (using `react-native-web`).
- **Styling**: Structured StyleSheet objects utilising a centralized theme design token file: `components/ui.jsx`.
- **Map Renderer**: React Leaflet (`^5.0.0`) under web with raw OpenStreetMap layers.

### Environment Context
The application uses two variables from configuration:
1. `EXPO_PUBLIC_MAPBOX_TOKEN` (defined in `.env` and `.env.example`).
2. Hardcoded geographical boundaries for **Tamil Nadu, India** inside Nominatim query templates to ensure searches resolve to relevant local areas:
   - Max Bounds: `[[8.0, 76.0], [13.6, 80.5]]`

---

## 3. Deep Dive: Key Technical Implementation Details

### A. Multi-Tiered Resilient Routing Engine
Stored inside `lib/location.js`, `getRoute()` implements a clever fallback strategy that tries 4 different strategies sequentially to calculate walking, driving, or cycling paths:

| Order | Strategy | Method / Details | Fallback Cause / Benefit |
| :--- | :--- | :--- | :--- |
| **1** | **Mapbox REST API** | Returns full geometries only if a valid token is set in `.env`. | Handled via abortable fetch. Bypassed if placeholder detected. |
| **2** | **OSRM Direct** | Direct GET to `router.project-osrm.org`. | Bypasses preflight checks securely if no custom headers are added. |
| **3** | **Valhalla OSM** | OSM Germany Valhalla routing API via URL query strings. | Used when OSRM fails due to endpoint outage. Includes polyline6 decoding. |
| **4** | **OSRM via Proxy** | Fetches OSRM API through the `allorigins.win` CORS fallback gateway. | Ultimate fallback ensuring web browser runs even under tight local restrictions. |

### B. Two-Tiered Simulated Authentication System
Defined in `lib/auth.js` and enforced inside the root `_layout.jsx`. It splits users into different application roles in-memory:

1. **Citizen User**: Role targeted at the general public.
   - **Credentials**: `citizen@safeher.test` / `citizen123`.
   - **Redirect Target**: `/(tabs)` index interface.
2. **Government Official**: Administrative role.
   - **Credentials**: `government@safeher.test` / `safeher123`.
   - **Redirect Target**: `/gov` dashboard to manage community safety.

---

## 4. Operational Workflows

### Live Journey Tracking Workflow
1. User configures a destination or retrieves their saved Work location.
2. Geolocation activates continuous updates via `navigator.geolocation.watchPosition`.
3. In-transit distance to destination is computed in real-time using the **Haversine formula**.
4. The remaining duration and ETA updates dynamically using walking/riding averages.
5. In case of issues, a "Smart SOS" allows sharing coordinates directly with an emergency contact.

### Crowdsourced Reporting Flow
1. **Report Submission**: Citizen detects visual/physical issues and logs them into `app/(tabs)/report.jsx`, selecting one of the standard tags (Poor lighting, harassment, etc.).
2. **Local Storage Broker**: Form data maps to `lib/localReports.js` and persists state.
3. **Dashboard Syncer**: The state notifies the active subscriber listening on the Government Screen.
4. **Official Review**: Dashboard inside `app/gov.jsx` displays stats/charts and updates the review status accordingly.

---

## 5. Architectural Recommendations

1. **Real Database Integration**: Migrate the mock authentication and local storage arrays inside `lib/auth.js` and `lib/localReports.js` to a real-time BaaS like Supabase or a PostgreSQL backend.
2. **Interactive Maps on Native platforms**: Currently, `RouteMap.jsx` falls back to a static view message on native mobile platforms. Expanding this to use `react-native-maps` would enable full-featured mobile support.
3. **Safety Engine Algorithm**: Build out the currently mock safety score logic so it scores routes on actual features (e.g. density of open reports, distance to police booths).
