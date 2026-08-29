import { useEffect } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const tamilNaduCenter = [11.1271, 78.6569];
const tamilNaduBounds = [[8.0, 76.0], [13.6, 80.5]];

const markerIcon = (color) => L.divIcon({
  className: 'safeher-map-marker',
  html: `<span style="background:${color}"></span>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function FitRoute({ points }) {
  const map = useMap();
  useEffect(() => {
    const refreshMap = () => {
      map.invalidateSize();
      if (points.length > 1) map.fitBounds(points, { padding: [28, 28] });
      else if (points.length === 1) map.setView(points[0], 14);
      map.invalidateSize();
    };
    const frame = requestAnimationFrame(refreshMap);
    return () => cancelAnimationFrame(frame);
  }, [map, points]);
  return null;
}

export default function RouteMap({ source, destination, route }) {
  const points = route?.coordinates || [source, destination].filter(Boolean).map((point) => [point.lat, point.lng]);
  const center = points[0] || tamilNaduCenter;
  return (
    <div className="safeher-route-map" style={{ height: 228, width: '100%' }}>
      <MapContainer center={center} zoom={points.length ? 13 : 7} maxBounds={tamilNaduBounds} maxBoundsViscosity={1} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
        {source ? <Marker position={[source.lat, source.lng]} icon={markerIcon('#007F7B')} /> : null}
        {destination ? <Marker position={[destination.lat, destination.lng]} icon={markerIcon('#E83D83')} /> : null}
        {route ? <Polyline positions={route.coordinates} pathOptions={{ color: '#007F7B', weight: 5 }} /> : null}
        <FitRoute points={points} />
      </MapContainer>
    </div>
  );
}
