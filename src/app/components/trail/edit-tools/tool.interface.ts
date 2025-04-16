import { Track } from 'src/app/model/track';
import { EditToolsComponent } from "./edit-tools.component";
import { Point } from 'src/app/model/point';

export interface PointReference {
  track: Track;
  segmentIndex: number;
  pointIndex: number;
  point: Point;
}

export interface PointReferenceRange {
  track: Track;
  start: PointReference;
  end: PointReference;
}

export interface EditTool {

  editTools: EditToolsComponent;

  hasOwnFooter: boolean;

  onPointClick?: (event: PointReference[]) => void;
  onRangeSelected?: (event: PointReferenceRange[]) => void;

}
