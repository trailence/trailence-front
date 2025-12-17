export class MapGenerator {

  public static readonly tileSize = 256;

  public static computeMapBounds(trackBounds: L.LatLngBounds, width: number, height: number, margin: number = 0.025): {zoom: number, bounds: Bounds} {
    let zoom = 5;
    let bounds = convertBounds(trackBounds.getNorth(), trackBounds.getWest(), trackBounds.getSouth(), trackBounds.getEast(), zoom);
    const maxPathWidth = width - (width * margin * 2);
    const maxPathHeight = height - (height * margin * 2);
    while (zoom < 17 && (bounds.x2 - bounds.x1) * this.tileSize < maxPathWidth && (bounds.y2 - bounds.y1) * this.tileSize < maxPathHeight) {
      zoom++;
      const newBounds = convertBounds(trackBounds.getNorth(), trackBounds.getWest(), trackBounds.getSouth(), trackBounds.getEast(), zoom);
      if ((newBounds.x2 - newBounds.x1) * this.tileSize > maxPathWidth || (newBounds.y2 - newBounds.y1) * this.tileSize > maxPathHeight) {
        zoom--;
        break;
      }
      bounds = newBounds;
    }
    return {zoom, bounds};
  }

  public static computeMap(trackBounds: L.LatLngBounds, width: number, height: number, margin: number = 0.025): {
    zoom: number,
    topTile: number,
    bottomTile: number,
    leftTile: number,
    rightTile: number,
    topDiff: number,
    leftDiff: number,
    mapLeft: number,
    mapTop: number,
  } {
    const mapBounds = this.computeMapBounds(trackBounds, width, height, margin);
    const bounds = mapBounds.bounds;
    const pathYMiddle = (bounds.y1 + (bounds.y2 - bounds.y1) / 2) * this.tileSize;
    const mapTop = pathYMiddle - height/2;
    const topTile = Math.floor(mapTop / this.tileSize);
    const topDiff = (topTile * this.tileSize) - mapTop;

    const pathXMiddle = (bounds.x1 + (bounds.x2 - bounds.x1) / 2) * this.tileSize;
    const mapLeft = pathXMiddle - width/2;
    const leftTile = Math.floor(mapLeft / this.tileSize);
    const leftDiff = (leftTile * this.tileSize) - mapLeft;

    const mapBottom = pathYMiddle + height/2;
    const bottomTile = Math.floor(mapBottom / this.tileSize);

    const mapRight = pathXMiddle + width/2;
    const rightTile = Math.floor(mapRight / this.tileSize);

    return { zoom: mapBounds.zoom, topTile, bottomTile, leftTile, rightTile, topDiff, leftDiff, mapLeft, mapTop };
  }

  public static getPathPt(pos: L.LatLngLiteral, zoom: number, mapLeft: number, mapTop: number): {x: number, y: number} {
    return {x: (lon2pt(pos.lng, zoom) * this.tileSize) - mapLeft, y: (lat2pt(pos.lat, zoom) * this.tileSize) - mapTop};
  }

}

function lon2pt(lon: number, zoom: number) { return (lon+180)/360*Math.pow(2,zoom); }
function lat2pt(lat: number, zoom: number)  { return (1-Math.log(Math.tan(lat*Math.PI/180) + 1/Math.cos(lat*Math.PI/180))/Math.PI)/2 *Math.pow(2,zoom); }

export interface Bounds {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function convertBounds(north: number, west: number, south: number, east: number, zoom: number): Bounds {
  const x1 = lon2pt(west, zoom);
  const x2 = lon2pt(east, zoom);
  const y1 = lat2pt(north, zoom);
  const y2 = lat2pt(south, zoom);
  return {
    x1: Math.min(x1, x2),
    y1: Math.min(y1, y2),
    x2: Math.max(x1, x2),
    y2: Math.max(y1, y2)
  };
}
