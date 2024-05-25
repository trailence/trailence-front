import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { TrailCollection, TrailCollectionType } from 'src/app/model/trail-collection';
import { AuthService } from 'src/app/services/auth/auth.service';
import { TrackService } from 'src/app/services/database/track.service';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { TrailService } from 'src/app/services/database/trail.service';
import { FileService } from 'src/app/services/file/file.service';
import { GpxImporter } from 'src/app/utils/formats/gpx-format';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [
    CommonModule
  ],
})
export class HomePage {
  constructor(
    public collectionService: TrailCollectionService,
    public trailService: TrailService,
    public trackService: TrackService,
    private auth: AuthService,
    private fileService: FileService,
  ) {}

  newCollection(): void {
    const col = new TrailCollection({
      owner: this.auth.email,
      type: TrailCollectionType.CUSTOM,
      name: 'Another collection ' + new Date().toISOString()
    });
    this.collectionService.create(col);
  }

  deleteCollection(collection: TrailCollection): void {
    this.collectionService.delete(collection);
  }

  renameCollection(collection: TrailCollection): void {
    collection.name = 'Renamed at ' + new Date().toISOString();
    this.collectionService.update(collection);
  }

  importGpx(collection: TrailCollection): void {
    this.fileService.openFileDialog({
      extension: '.gpx',
      mimeType: 'application/gpx+xml',
      multiple: true,
      description: 'TODO',
      onreading: () => new Promise((resolve, reject) => {
        resolve(null);
      }),
      onloaded: (files, fromReading) => {
        files.forEach(file => {
          const imported = GpxImporter.importGpx(file, this.auth.email!, collection.uuid);
          this.trackService.create(imported.track);
          this.trailService.create(imported.trail);
        });
      },
      onerror: (error, fromReading) => {
        console.log(error);
      }
    })
  }

}
