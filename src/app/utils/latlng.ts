export function distance(latlng1: {lat: number, lng: number}, latlng2: {lat: number, lng: number}) {
  const rad = Math.PI / 180,
  lat1 = latlng1.lat * rad,
  lat2 = latlng2.lat * rad,
  sinDLat = Math.sin((latlng2.lat - latlng1.lat) * rad / 2),
  sinDLon = Math.sin((latlng2.lng - latlng1.lng) * rad / 2),
  a = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon,
  c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371000 * c;
}
