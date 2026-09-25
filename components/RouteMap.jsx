import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

/**
 * Native RouteMap — renders an OpenStreetMap tile map inside a WebView.
 * Works on both Android and iOS APKs without any paid map SDK.
 */
export default function RouteMap({ source, destination, route, allRoutes, selectedRouteIndex, onSelectRoute }) {
  const [loading, setLoading] = useState(true);

  // Build the coordinates array for the selected / best route
  const coords =
    route?.coordinates ||
    (allRoutes && allRoutes.length > 0 ? allRoutes[selectedRouteIndex ?? 0]?.coordinates : null) ||
    [];

  const srcStr = source ? `[${source.lat}, ${source.lng}]` : 'null';
  const dstStr = destination ? `[${destination.lat}, ${destination.lng}]` : 'null';
  const coordsStr = JSON.stringify(coords.slice(0, 500)); // cap to avoid huge HTML
  const allRoutesStr = JSON.stringify(
    (allRoutes || []).map((r, i) => ({
      coords: (r.coordinates || []).slice(0, 300),
      selected: i === (selectedRouteIndex ?? 0),
    }))
  );

  // Inline HTML with Leaflet loaded from CDN — works offline via cached tiles too
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; }
    .dot-src { background: #007F7B; border: 2.5px solid #fff; }
    .dot-dst { background: #E83D83; border: 2.5px solid #fff; }
    .dot-src, .dot-dst { border-radius: 50%; width: 16px; height: 16px; box-shadow: 0 2px 6px rgba(0,0,0,0.35); }
  </style>
</head>
<body>
<div id="map"></div>
<script>
  var src = ${srcStr};
  var dst = ${dstStr};
  var routeCoords = ${coordsStr};
  var allRoutes = ${allRoutesStr};

  var map = L.map('map', { zoomControl: true, attributionControl: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18
  }).addTo(map);

  function dotIcon(cls) {
    return L.divIcon({ className: '', html: '<div class="' + cls + '"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
  }

  var bounds = [];

  if (src) {
    L.marker(src, { icon: dotIcon('dot-src') }).addTo(map);
    bounds.push(src);
  }
  if (dst) {
    L.marker(dst, { icon: dotIcon('dot-dst') }).addTo(map);
    bounds.push(dst);
  }

  if (allRoutes && allRoutes.length > 1) {
    allRoutes.forEach(function(r, idx) {
      if (!r.coords || r.coords.length < 2) return;
      var color = r.selected ? '#5B4FD9' : '#718096';
      var weight = r.selected ? 5 : 3;
      var opacity = r.selected ? 1.0 : 0.55;
      var polyline = L.polyline(r.coords, { color: color, weight: weight, opacity: opacity }).addTo(map);
      r.coords.forEach(function(c) { bounds.push(c); });
    });
  } else if (routeCoords && routeCoords.length > 1) {
    L.polyline(routeCoords, { color: '#5B4FD9', weight: 5 }).addTo(map);
    routeCoords.forEach(function(c) { bounds.push(c); });
  }

  if (bounds.length > 1) {
    map.fitBounds(L.latLngBounds(bounds), { padding: [24, 24] });
  } else if (bounds.length === 1) {
    map.setView(bounds[0], 14);
  } else {
    map.setView([11.1271, 78.6569], 7);
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
          <ActivityIndicator color="#5B4FD9" size="small" />
          <Text style={styles.loadingText}>Loading map…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative', backgroundColor: '#E3F3F0' },
  webview: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#E3F3F0',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: { fontSize: 12, color: '#555', fontWeight: '500' },
});
