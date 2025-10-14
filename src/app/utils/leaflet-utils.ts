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

}
