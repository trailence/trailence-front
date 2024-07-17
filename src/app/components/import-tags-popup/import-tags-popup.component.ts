import { Component, Input, OnInit } from '@angular/core';
import { first, map, of, switchMap, zip } from 'rxjs';
import { Tag } from 'src/app/model/tag';
import { TagService } from 'src/app/services/database/tag.service';
import { firstTimeout } from 'src/app/utils/rxjs/first-timeout';
import { IonHeader, IonToolbar, IonTitle, IonIcon, IonLabel, IonContent, IonButton, ModalController } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { CommonModule } from '@angular/common';
import { AuthService } from 'src/app/services/auth/auth.service';
import { Arrays } from 'src/app/utils/arrays';

class ResolvedTag {
  constructor(
    public fullName: string,
    public resolvedUuid: string | null,
    public tree: {name: string, uuid: string | null}[],
  ) {}
}

@Component({
  selector: 'app-import-tags-popup',
  templateUrl: './import-tags-popup.component.html',
  styleUrls: ['./import-tags-popup.component.scss'],
  standalone: true,
  imports: [IonButton, IonContent, IonLabel, IonIcon, IonTitle, IonToolbar, IonHeader, CommonModule ]
})
export class ImportTagsPopupComponent  implements OnInit {

  @Input() collectionUuid!: string;
  @Input() tags!: string[][];
  @Input() toImport!: {trailUuid: string, tags: string[][]}[];

  resolvedTags?: ResolvedTag[];
  hasExisting = false;
  hasMissing = false;

  constructor(
    public i18n: I18nService,
    private tagService: TagService,
    private modalController: ModalController,
    private auth: AuthService,
  ) { }

  ngOnInit() {
    this.tagService.getAllTags$().pipe(
      switchMap(tags => {
        if (tags.length === 0) return of([]);
        return zip(tags.map(tag => tag.pipe(firstTimeout(t => !!t, 5000, () => null as (Tag | null)))));
      }),
      first(),
      map(tags => tags.filter(tag => !!tag && tag.collectionUuid === this.collectionUuid) as Tag[])
    ).subscribe(
      existingTags => {
        this.resolvedTags = this.tags.map(
          names => {
            const fullName = names.join('/');
            const tree: {name: string, uuid: string | null}[] = [];
            let parentUuid: string | null | undefined = null;
            for (const name of names) {
              const tag: Tag | undefined = parentUuid === undefined ? undefined : existingTags.find(t => t.parentUuid === parentUuid && t.name === name);
              tree.push({name, uuid: tag?.uuid ?? null});
              parentUuid = tag?.uuid ?? undefined;
            }
            const uuid = tree[tree.length - 1].uuid;
            if (uuid) this.hasExisting = true; else this.hasMissing = true;
            return new ResolvedTag(fullName, uuid, tree);
          }
        );
      }
    );
  }

  import(existing: boolean, missing: boolean): void {
    if (missing) this.importMissing();
    if (existing) this.importExisting();
    this.modalController.dismiss(null, 'ok');
  }

  private importMissing(): void {
    let maxLevel = 0;
    for (const resolved of this.resolvedTags!) {
      maxLevel = Math.max(maxLevel, resolved.tree.length - 1);
    }
    for (let level = 0; level <= maxLevel; level++)
      this.importMissingLevel(level);
  }

  private importMissingLevel(level: number): void {
    const created = new Map<string, string>();
    for (const resolved of this.resolvedTags!) {
      if (!resolved.tree[level].uuid) {
        const done = created.get(resolved.tree[level].name);
        if (done) resolved.tree[level].uuid = done;
        else {
          const tag = new Tag({
            collectionUuid: this.collectionUuid,
            owner: this.auth.email,
            name: resolved.tree[level].name,
            parentUuid: level > 0 ? resolved.tree[level - 1].uuid! : undefined,
          });
          this.tagService.create(tag)
          resolved.tree[level].uuid = tag.uuid;
        }
      }
    }
  }

  private importExisting(): void {
    for (const resolved of this.resolvedTags!) {
      const uuid = resolved.tree[resolved.tree.length - 1].uuid;
      if (!uuid) continue;
      const resolvedTags = resolved.tree.map(node => node.name);
      for (const trail of this.toImport) {
        for (const tags of trail.tags) {
          if (Arrays.sameContent(tags, resolvedTags)) {
            this.tagService.addTrailTag(trail.trailUuid, uuid);
          }
        }
      }
    }
  }

  cancel(): void {
    this.modalController.dismiss(null, 'cancel');
  }

}
