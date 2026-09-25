import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';

/**
 * Native NavigationMap — renders a live Leaflet map inside a WebView.
 * Mirrors the NavigationMap.web.jsx experience on Android / iOS APKs.
 *
 * Props:
 *   routeCoords   [[lat,lng], ...]  full route polyline
 *   travelledIdx  int               index up to which the route is "done"
 *   liveLocation  { lat, lng }      current GPS position
 *   destination   { lat, lng }      end point
 */
export default function NavigationMap({
  routeCoords = [],
  travelledIdx = 0,
  liveLocation = null,
  destination = null,
}) {
  const [loading, setLoading] = useState(true);

  const hasLive = liveLocation && liveLocation.lat && liveLocation.lng;
  const livePos = hasLive ? [liveLocation.lat, liveLocation.lng] : null;
  const destPos = destination ? [destination.lat, destination.lng] : null;

  const upcomingCoords = routeCoords.slice(Math.max(0, travelledIdx));
  const travelledCoords = routeCoords.slice(0, Math.min(travelledIdx + 1, routeCoords.length));

  const center =
    livePos ||
    destPos ||
    (routeCoords.length > 0 ? routeCoords[0] : [11.1271, 78.6569]);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body, #map { width:100%; height:100%; background:#1a1f2e; }
    @keyframes pulse-ring {
      0%   { transform: scale(0.6); opacity: 0.9; }
      100% { transform: scale(1.8); opacity: 0; }
    }
    .live-dot-outer { position:relative; width:20px; height:20px; }
    .live-dot { width:20px; height:20px; border-radius:50%; background:#4285F4; border:3px solid #fff; box-shadow:0 2px 8px rgba(66,133,244,0.6); }
    .live-ring { position:absolute; inset:-8px; border-radius:50%; background:rgba(66,133,244,0.22); animation:pulse-ring 1.6s ease-out infinite; }
    .dest-pin { width:22px; height:28px; background:#E83D83; border-radius:50% 50% 50% 0; transform:rotate(-45deg); border:3px solid #fff; box-shadow:0 3px 10px rgba(232,61,131,0.5); }
  </style>
</head>
<body>
<div id="map"></div>
<script>
  var travelledCoords = ${JSON.stringify(travelledCoords.slice(0, 300))};
  var upcomingCoords  = ${JSON.stringify(upcomingCoords.slice(0, 300))};
  var livePos         = ${JSON.stringify(livePos)};
  var destPos         = ${JSON.stringify(destPos)};
  var center          = ${JSON.stringify(center)};

  var map = L.map('map', { zoomControl: false, attributionControl: false });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  }).addTo(map);
  map.setView(center, livePos ? 16 : 13);

  // Route outline (depth)
  if (upcomingCoords.length > 1) {
    L.polyline(upcomingCoords, { color: '#1565C0', weight: 11, opacity: 0.3 }).addTo(map);
  }
  // Travelled segment
  if (travelledCoords.length > 1) {
    L.polyline(travelledCoords, { color: '#9AA8C0', weight: 6, opacity: 0.6 }).addTo(map);
  }
  // Upcoming segment
  if (upcomingCoords.length > 1) {
    L.polyline(upcomingCoords, { color: '#4285F4', weight: 7, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(map);
  }

  // Destination pin
  if (destPos) {
    var destIcon = L.divIcon({ className: '', html: '<div class="dest-pin"></div>', iconSize: [22, 28], iconAnchor: [11, 28] });
    L.marker(destPos, { icon: destIcon }).addTo(map);
  }

  // Live location pulsing dot
  var liveMarker = null;
  function addLiveMarker(pos) {
    var liveIcon = L.divIcon({
      className: '',
      html: '<div class="live-dot-outer"><div class="live-dot"></div><div class="live-ring"></div></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });
    if (liveMarker) { map.removeLayer(liveMarker); }
    liveMarker = L.marker(pos, { icon: liveIcon }).addTo(map);
  }

  if (livePos) {
    addLiveMarker(livePos);
    map.setView(livePos, 16, { animate: true });
  }

  // Fit bounds if no live location
  var allPts = upcomingCoords.concat(travelledCoords);
  if (!livePos && allPts.length > 1) {
    map.fitBounds(L.latLngBounds(allPts), { padding: [48, 48] });
  }

  setTimeout(function() { map.invalidateSize(); }, 300);
<\/script>
</body>
</html>`;

  return (
    <View style={styles.container}>
      <WebView
        source={{ html }}
        style={styles.webview}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        onLoadEnd={() => setLoading(false)}
        onError={() => setLoading(false)}
        scrollEnabled={false}
        bounces={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      />
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#4285F4" size="small" />
          <Text style={styles.loadingText}>Loading navigation map…</Text>
        </View>
      )}
      {liveLocation && (
        <View style={styles.coordBadge}>
          <Text style={styles.coordText}>
            {liveLocation.lat?.toFixed(5)}, {liveLocation.lng?.toFixed(5)}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative', backgroundColor: '#1a1f2e' },
  webview: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1a1f2e',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: { color: '#9AA8C0', fontSize: 13, fontWeight: '500' },
  coordBadge: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  coordText: { color: '#fff', fontSize: 11 },
});
