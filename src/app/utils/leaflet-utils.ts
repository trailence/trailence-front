import * as L from 'leaflet';

export class LeafletUtils {

  /** clean bounds to remove the ones contained in an other one */
  public static cleanBounds(allBounds: L.LatLngBounds[]): void {
    for (let i = 1; i < allBounds.length; ++i) {
      const b1 = allBounds[i];
      let remove = false;
      for (let j = 0; j < i; ++j) {
        const b2 = allBounds[j];
        if (b2.contains(b1)) {
          remove = true;
          break;
        }
      }
      if (remove) {
        allBounds.splice(i, 1);
        i--;
      }
    }
  }

  public static normalizeBounds(bounds: L.LatLngBounds): L.LatLngBounds {
    let modified = false;
    let north = bounds.getNorth();
    if (north > 90) {
      north = 90;
      modified = true;
    }
    let south = bounds.getSouth();
    if (south < -90) {
      south = -90;
      modified = true;
    }
    let east = bounds.getEast();
    let west = bounds.getWest();
    if (east - west > 360) {
      west = -180;
      east = 180;
      modified = true;
    } else {
      while (west < -180) {
        west += 360;
        east += 360;
        modified = true;
      }
      while (east > 180) {
        east -= 360;
        west -= 360;
        modified = true;
      }
      if (west < -180 || west > 180 || east < -180 || east > 180) {
        west = -180;
        east = 180;
        modified = true;
      }
    }
    if (!modified) return bounds;
    return L.latLngBounds({lat: south, lng: west}, {lat: north, lng: east});
  }

}
