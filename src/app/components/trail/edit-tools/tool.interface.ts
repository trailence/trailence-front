import { MapTrackPointReference } from '../../map/track/map-track-point-reference';
import { EditToolsComponent } from "./edit-tools.component";

export interface EditTool {

  editTools: EditToolsComponent;

  hasOwnFooter: boolean;

  onMapClick?: (event: MapTrackPointReference[]) => void;

}
