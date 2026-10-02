/**
 * Map tile configuration.
 *
 * MapTiler provides the visuals; it does NOT provide routing. The engine still
 * asks OSRM for route geometry, and the safety engine still judges the result.
 *
 *   OSRM  -> "brain" that finds the routes
 *   MapTiler -> "eyes" that display them
 *   Safe-Her Safety Engine -> "brain" that judges the safety signals
 *
 * Why this replaced the previous sources:
 *  - `tile.openstreetmap.org` was used directly, which OSM's tile usage policy
 *    discourages for apps, and the native map had `attributionControl: false`,
 *    stripping the required attribution.
 *  - The journey map used a different provider (CartoDB), so the two maps in the
 *    same app looked nothing alike and could fail independently.
 *  - Leaflet itself was loaded from unpkg at runtime, so a blank map whenever
 *    the CDN was unreachable - unacceptable for a safety app.
 *
 * Falls back to plain OpenStreetMap tiles when no key is configured, so the map
 * always renders even before `.env` is filled in.
 */

const RAW_KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY || '';

/** True when a plausible MapTiler key is present. */
export const hasMapTilerKey = (() => {
  const k = RAW_KEY.trim();
  if (!k) return false;
  // Treat copy-paste placeholders as "not configured" rather than sending a
  // bogus key on every tile request.
  return !/^(your[_-]|<|xxx|todo|changeme|placeholder)/i.test(k);
})();

const MAPTILER_KEY = hasMapTilerKey ? RAW_KEY.trim() : '';

/**
 * Every raster style verified as available on MapTiler Cloud.
 * `light-v2` / `dark-v2` are vector-only and return 404 as raster, so they are
 * deliberately absent.
 *
 * `ALIASES` maps the friendly names used in code to MapTiler style ids.
 */
export const TILE_STYLES = {
  /** Route planner: clean, high-contrast, detailed street names. */
  streets: 'streets-v2',
  /** Journey/navigation: stronger contrast, easier to read outdoors. */
  outdoor: 'outdoor-v2',
  /** Quiet, low-detail basemap. */
  basic: 'basic-v2',
  satellite: 'satellite',
  hybrid: 'hybrid',
};

/** Raw MapTiler raster style ids, so a typo can never become a blank-tile URL. */
const KNOWN_RASTER_STYLES = new Set(Object.values(TILE_STYLES));

/**
 * Resolve a style alias or raw style id to a valid MapTiler style id.
 * Anything unrecognised becomes `streets-v2` rather than being passed through -
 * the previous version forwarded the raw argument, so an unknown value produced
 * a request for `maps/nope/...` and MapTiler answered with a blank tile.
 */
function resolveStyle(style) {
  const alias = TILE_STYLES[style];
  if (alias) return alias;
  if (typeof style === 'string' && KNOWN_RASTER_STYLES.has(style)) return style;
  return TILE_STYLES.streets;
}

/**
 * Build a Leaflet tile URL template.
 * With `detectRetina: true` Leaflet substitutes `{r}` with `@2x` on high-DPI
 * screens, which MapTiler serves at 512px - so tiles stay sharp on a phone.
 *
 * @param {string} style - an alias from TILE_STYLES, or a raw style id
 * @returns {string} Leaflet `{z}/{x}/{y}` template
 */
export function tileUrlTemplate(style = 'streets') {
  if (!MAPTILER_KEY) {
    // Fallback: plain OSM raster tiles.
    return 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  }
  return `https://api.maptiler.com/maps/${resolveStyle(style)}/256/{z}/{x}/{y}{r}.png?key=${MAPTILER_KEY}`;
}

/**
 * Attribution string. Required by both MapTiler and OSM licences, so it is
 * always non-empty and must be displayed.
 */
export function tileAttribution() {
  return hasMapTilerKey
    ? '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
}

/** Leaflet TileLayer options shared by every map in the app. */
export function tileLayerOptions(style = 'streets', extra = {}) {
  return {
    // Leaflet substitutes {r} with @2x on retina displays; MapTiler serves those.
    detectRetina: hasMapTilerKey,
    maxZoom: 19,
    crossOrigin: true,
    ...extra,
  };
}