const STORAGE_KEY = 'safeher-local-reports';
const defaultReports = [
  { id: 'report-001', category: 'Poor lighting', location_label: 'Adyar bus stop', details: 'Streetlights were out after 9 PM.', created_at: new Date().toISOString() },
  { id: 'report-002', category: 'Unsafe stop', location_label: 'Guindy station entrance', details: 'The waiting area was very crowded.', created_at: new Date(Date.now() - 3600000 * 3).toISOString() },
  { id: 'report-003', category: 'Broken CCTV', location_label: 'T Nagar market', details: 'Camera near the north gate appears inactive.', created_at: new Date(Date.now() - 86400000).toISOString() },
];
const listeners = new Set();

function loadReports() {
  if (typeof localStorage === 'undefined') return [...defaultReports];
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [...defaultReports];
  } catch {
    return [...defaultReports];
  }
}

const reports = loadReports();

function persistReports() {
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  listeners.forEach((listener) => listener());
}

export function getReports() {
  return reports;
}

export function addReport(report) {
  reports.unshift({ ...report, id: `report-${Date.now()}`, created_at: new Date().toISOString() });
  persistReports();
}

export function subscribeReports(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}