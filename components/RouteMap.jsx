import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  tileUrlTemplate,
  tileAttribution,
  tileLayerOptions,
  hasMapTilerKey,
} from '../lib/mapTiles';

const BRAND = {
  selected: '#5B4FD9',
  alternative: '#718096',
  source: '#007F7B',
  destination: '#E83D83',
};

/**
 * Native RouteMap — renders an OpenStreetMap tile map inside a WebView.
 * Works on both Android and iOS APKs without any paid map SDK.
 *
 * Multiple routes
 * ---------------
 * Every route in `allRoutes` is drawn. The one at `selectedRouteIndex` is
 * emphasised (thicker, full opacity, drawn on top); the rest stay visible but
 * muted and dashed.
 *
 * Tapping a route selects it. That works through a WebView message bridge:
 *   Leaflet  ->  window.ReactNativeWebView.postMessage(...)
 *            ->  onMessage  ->  onSelectRoute(index)
 * Previously `onSelectRoute` was destructured and never called, so route
 * selection only ever worked on the web build - tapping a route on Android did
 * nothing at all.
 *
 * Selection changes do NOT rebuild the document. The HTML is memoised on the
 * route data and the selected index is pushed in with `injectJavaScript`,
 * because re-rendering the whole HTML on every tap tore down and rebuilt the
 * Leaflet instance (white flash plus a full tile re-load).
 */
export default function RouteMap({
  source,
  destination,
  route,
  allRoutes,
  selectedRouteIndex,
  onSelectRoute,
}) {
  const [loading, setLoading] = useState(true);
  const webRef = useRef(null);
  const selectedRef = useRef(selectedRouteIndex ?? 0);

  const routes = useMemo(
    () =>
      (allRoutes && allRoutes.length > 0
        ? allRoutes
        : route
          ? [route]
          : []
      ).map((r) => (r && Array.isArray(r.coordinates) ? r.coordinates : [])),
    [allRoutes, route]
  );

  const selected = selectedRouteIndex ?? 0;

  // Only depends on the route DATA, never on which route is selected.
  const html = useMemo(() => {
    const srcStr = source ? `[${source.lat}, ${source.lng}]` : 'null';
    const dstStr = destination ? `[${destination.lat}, ${destination.lng}]` : 'null';
    // Cap vertices per route to keep the injected HTML manageable.
    const routesJson = JSON.stringify(routes.map((c) => c.slice(0, 400)));
    const tileUrl = tileUrlTemplate('streets');
    const attribution = tileAttribution();
    const tileOpts = tileLayerOptions('streets');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; }
    .dot-src { background: ${BRAND.source}; border: 2.5px solid #fff; }
    .dot-dst { background: ${BRAND.destination}; border: 2.5px solid #fff; }
    .dot-src, .dot-dst { border-radius: 50%; width: 16px; height: 16px; box-shadow: 0 2px 6px rgba(0,0,0,0.35); }
    /* Keep the required attribution legible without covering the map. */
    .leaflet-control-attribution { font-size: 9px !important; background: rgba(255,255,255,0.82) !important; }
  </style>
</head>
<body>
<div id="map"></div>
<script>
  var src = ${srcStr};
  var dst = ${dstStr};
  var routeCoords = ${routesJson};

  function send(msg) {
    try {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      }
    } catch (e) {}
  }

  var map = L.map('map', { zoomControl: false, attributionControl: true });
  L.tileLayer('${tileUrl}', ${JSON.stringify(tileOpts)})
    .addTo(map)
    .on('error', function() { send({ type: 'tileError' }); });

  function dotIcon(cls) {
    return L.divIcon({ className: '', html: '<div class="' + cls + '"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
  }

  var bounds = [];
  if (src) { L.marker(src, { icon: dotIcon('dot-src') }).addTo(map); bounds.push(src); }
  if (dst) { L.marker(dst, { icon: dotIcon('dot-dst') }).addTo(map); bounds.push(dst); }

  var lines = [];

  function styleFor(i) {
    var isSel = i === window.__selected;
    return {
      color: isSel ? '${BRAND.selected}' : '${BRAND.alternative}',
      weight: isSel ? 6 : 3,
      opacity: isSel ? 1.0 : 0.55,
      dashArray: isSel ? null : '7, 7'
    };
  }

  routeCoords.forEach(function(coords, idx) {
    if (!coords || coords.length < 2) return;

    var main = L.polyline(coords, styleFor(idx)).addTo(map);
    // Transparent, much fatter line purely as a touch target. A 3px line is
    // almost impossible to tap accurately on a phone.
    var hit = L.polyline(coords, {
      color: '${BRAND.selected}', weight: 26, opacity: 0
    }).addTo(map);

    function tap(ev) {
      L.DomEvent.stopPropagation(ev);
      send({ type: 'selectRoute', index: idx });
    }
    main.on('click', tap);
    hit.on('click', tap);

    lines.push(main);
    coords.forEach(function(c) { bounds.push(c); });
  });

  // Called from React via injectJavaScript whenever the selection changes.
  window.__setSelected = function(i) {
    window.__selected = i;
    lines.forEach(function(line, idx) {
      line.setStyle(styleFor(idx));
      if (idx === i) { line.bringToFront(); }
    });
    send({ type: 'selectedApplied', index: i });
  };

  window.__selected = 0;
  lines.forEach(function(line, idx) { if (idx === 0) line.bringToFront(); });

  if (bounds.length > 1) {
    map.fitBounds(L.latLngBounds(bounds), { padding: [28, 28] });
  } else if (bounds.length === 1) {
    map.setView(bounds[0], 14);
  } else {
    map.setView([11.1271, 78.6569], 7);
  }

  // Tapping empty map space should deselect nothing but must not crash.
  map.on('click', function() { send({ type: 'mapTapped' }); });

  setTimeout(function() { map.invalidateSize(); }, 300);
<\/script>
</body>
</html>`;
  }, [routes, source?.lat, source?.lng, destination?.lat, destination?.lng]);

  // Push the selection into the existing map instead of re-rendering it.
  useEffect(() => {
    if (selectedRef.current === selected) return;
    selectedRef.current = selected;
    const wv = webRef.current;
    if (!wv) return;
    try {
      wv.injectJavaScript(
        `window.__setSelected && window.__setSelected(${Number(selected) || 0}); true;`
      );
    } catch {
      /* the map will pick it up on its next full render */
    }
  }, [selected]);

  function handleMessage(event) {
    if (!onSelectRoute) return;
    let payload = null;
    try {
      payload = JSON.parse(event?.nativeEvent?.data ?? '');
    } catch {
      return;
    }
    if (!payload || payload.type !== 'selectRoute') return;
    const idx = Number(payload.index);
    if (Number.isInteger(idx) && idx >= 0 && idx < routes.length) {
      onSelectRoute(idx);
    }
  }

  const tappable = routes.length > 1;

  return (
    <View style={styles.container}>
      <WebView
        ref={webRef}
        source={{ html }}
        style={styles.webview}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        onLoadEnd={() => setLoading(false)}
        onError={() => setLoading(false)}
        onMessage={handleMessage}
        scrollEnabled
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        setBuiltInZoomControls={false}
      />
      {loading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color={BRAND.selected} size="small" />
          <Text style={styles.loadingText}>Loading map…</Text>
        </View>
      )}
      {tappable && !loading && (
        <View style={styles.tapHint} pointerEvents="none">
          <Text style={styles.tapHintText}>Tap a route to select it</Text>
        </View>
      )}
      {!hasMapTilerKey && !loading ? (
        <View style={styles.noKeyHint} pointerEvents="none">
          <Text style={styles.noKeyText}>Using OpenStreetMap tiles · add a MapTiler key for richer maps</Text>
        </View>
      ) : null}
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
  tapHint: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    backgroundColor: 'rgba(30,27,75,0.78)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  tapHintText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  noKeyHint: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(30,27,75,0.72)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  noKeyText: { color: '#EDE9FE', fontSize: 9.5, fontWeight: '600' },
});
