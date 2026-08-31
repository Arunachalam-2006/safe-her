import { useEffect, useRef } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/* ─── Map style tiles (CartoDB dark for navigation feel) ─── */
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

/* ─── Custom icons ─── */
const liveLocationIcon = () =>
  L.divIcon({
    className: '',
    html: `
      <div style="
        width:20px;height:20px;
        border-radius:50%;
        background:#4285F4;
        border:3px solid #fff;
        box-shadow:0 2px 8px rgba(66,133,244,0.6);
        position:relative;
      ">
        <div style="
          position:absolute;
          inset:-8px;
          border-radius:50%;
          background:rgba(66,133,244,0.22);
          animation:pulse-ring 1.6s ease-out infinite;
        "></div>
      </div>
      <style>
        @keyframes pulse-ring {
          0%   { transform:scale(0.6); opacity:0.9; }
          100% { transform:scale(1.8); opacity:0; }
        }
      </style>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

const destIcon = () =>
  L.divIcon({
    className: '',
    html: `<div style="
      width:26px;height:34px;
      background:#E83D83;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      border:3px solid #fff;
      box-shadow:0 3px 10px rgba(232,61,131,0.5);
    "></div>`,
    iconSize: [26, 34],
    iconAnchor: [13, 34],
  });

/* ─── Component: keep map centred on current position ─── */
function TrackLocation({ position, heading }) {
  const map = useMap();
  const isInitRef = useRef(false);

  useEffect(() => {
    if (!position) return;
    const zoom = isInitRef.current ? map.getZoom() : 16;
    map.setView(position, zoom, { animate: true, duration: 0.8 });
    isInitRef.current = true;
  }, [map, position]);

  return null;
}

/* ─── Component: fit to full route on first load ─── */
function FitRoute({ points, hasLiveLocation }) {
  const map = useMap();
  const doneRef = useRef(false);

  useEffect(() => {
    if (doneRef.current || !points?.length) return;
    if (hasLiveLocation) return; // TrackLocation handles it
    map.invalidateSize();
    if (points.length > 1) map.fitBounds(points, { padding: [48, 48] });
    else map.setView(points[0], 15);
    doneRef.current = true;
  }, [map, points, hasLiveLocation]);

  return null;
}

/**
 * Full-screen Google-Maps-style navigation map.
 *
 * Props:
 *   routeCoords   [[lat,lng], ...]  full route polyline
 *   travelledIdx  int               index up to which the route is "done"
 *   liveLocation  { lat, lng }      current GPS position
 *   destination   { lat, lng }      end point
 *   height        string | number   CSS height (default "100%")
 */
export default function NavigationMap({
  routeCoords = [],
  travelledIdx = 0,
  liveLocation = null,
  destination = null,
  height = '100%',
}) {
  const hasLive = liveLocation && liveLocation.lat && liveLocation.lng;
  const livePos = hasLive ? [liveLocation.lat, liveLocation.lng] : null;
  const destPos = destination ? [destination.lat, destination.lng] : null;

  /* Split route into travelled (grey) + upcoming (blue) */
  const upcomingCoords = routeCoords.slice(Math.max(0, travelledIdx));
  const travelledCoords = routeCoords.slice(0, Math.min(travelledIdx + 1, routeCoords.length));

  /* Points for initial fit */
  const fitPoints =
    routeCoords.length > 1
      ? routeCoords
      : [livePos, destPos].filter(Boolean);

  /* Initial center */
  const center = livePos || destPos || routeCoords[0] || [11.1271, 78.6569];

  return (
    <div style={{ height, width: '100%', position: 'relative' }}>
      <MapContainer
        center={center}
        zoom={livePos ? 16 : 13}
        zoomControl={false}
        attributionControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTR} />

        {/* Travelled segment – muted grey */}
        {travelledCoords.length > 1 && (
          <Polyline
            positions={travelledCoords}
            pathOptions={{ color: '#9AA8C0', weight: 6, opacity: 0.6 }}
          />
        )}

        {/* Upcoming segment – vibrant blue */}
        {upcomingCoords.length > 1 && (
          <Polyline
            positions={upcomingCoords}
            pathOptions={{ color: '#4285F4', weight: 7, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }}
          />
        )}

        {/* Route outline for depth */}
        {upcomingCoords.length > 1 && (
          <Polyline
            positions={upcomingCoords}
            pathOptions={{ color: '#1565C0', weight: 11, opacity: 0.3 }}
          />
        )}

        {/* Destination pin */}
        {destPos && <Marker position={destPos} icon={destIcon()} />}

        {/* Live location pulsing dot */}
        {livePos && (
          <>
            <Circle center={livePos} radius={60} pathOptions={{ color: '#4285F4', fillColor: '#4285F4', fillOpacity: 0.15, weight: 0 }} />
            <Marker position={livePos} icon={liveLocationIcon()} />
          </>
        )}

        {/* Map controllers */}
        <TrackLocation position={livePos} />
        <FitRoute points={fitPoints} hasLiveLocation={!!livePos} />
      </MapContainer>
    </div>
  );
}
