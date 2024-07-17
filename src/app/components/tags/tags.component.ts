import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonHeader, IonContent, IonFooter, IonToolbar, IonTitle, IonIcon, IonLabel, IonButton, IonButtons, ModalController, IonInput, IonCheckbox, AlertController } from "@ionic/angular/standalone";
import { Subscription, combineLatest, debounceTime, of, switchMap } from 'rxjs';
import { Tag } from 'src/app/model/tag';
import { Trail } from 'src/app/model/trail';
import { TrailTag } from 'src/app/model/trail-tag';
import { AuthService } from 'src/app/services/auth/auth.service';
import { TagService } from 'src/app/services/database/tag.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { collection$items } from 'src/app/utils/rxjs/collection$items';

class TagNode {

  public editing = false;
  public newName = '';

  constructor(
    public tag: Tag,
    public existing: number,
    public userSelected: boolean | undefined,
    public children: TagNode[] = [],
    public parentNode?: TagNode,
  ) {}

}

@Component({
  selector: 'app-tags',
  templateUrl: './tags.component.html',
  styleUrls: ['./tags.component.scss'],
  standalone: true,
  imports: [IonCheckbox, IonInput, IonButtons, IonButton, IonLabel, IonIcon, IonTitle, IonToolbar, IonFooter, IonContent, IonHeader, CommonModule, FormsModule, ]
})
export class TagsComponent implements OnInit, OnChanges, OnDestroy {

  @Input() collectionUuid?: string;
  @Input() trails?: Trail[];

  tree: TagNode[] = [];

  newTagName = '';

  private subscription?: Subscription;

  constructor(
    public i18n: I18nService,
    private modalController: ModalController,
    private alertController: AlertController,
    private tagService: TagService,
    private auth: AuthService,
  ) { }

  ngOnInit(): void {
    this.update();
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.update();
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  private update(): void {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
    this.tree = [];

    if (!this.collectionUuid || !this.trails) return;

    const tags$ = this.tagService.getAllTags$().pipe(
      collection$items(tag => tag.collectionUuid === this.collectionUuid)
    );
    const trailsTags$ = this.tagService.getTrailsTags$(this.trails.map(t => t.uuid));

    this.subscription = combineLatest([tags$, trailsTags$]).pipe(
      debounceTime(100)
    ).subscribe(
      ([tags, trailsTags]) => {
        this.tree = this.buildTree(tags, this.tree, trailsTags);
      }
    );
  }

  private buildTree(tags: Tag[], nodes: TagNode[], trailsTags: TrailTag[]): TagNode[] {
    const toRemove = this.flatten(nodes);
    const newTree =  this.buildTreeNodes(toRemove, tags, trailsTags, null, undefined);
    return newTree;
  }

  private buildTreeNodes(toRemove: TagNode[], tags: Tag[], trailsTags: TrailTag[], parentUuid: string | null, parentNode?: TagNode): TagNode[] {
    const nodes: TagNode[] = [];
    for (let i = 0; i < tags.length; ++i) {
      if (tags[i].parentUuid !== parentUuid) continue;
      const tag = tags[i];
      tags.splice(i, 1);
      i--;

      const index = toRemove.findIndex(node => node.tag.uuid === tag.uuid);
      const existing = trailsTags.reduce((count, t) => count + (t && t.tagUuid === tag.uuid ? 1 : 0), 0);
      if (index >= 0) {
        const node = toRemove[index];
        toRemove.splice(index, 1);
        node.tag = tag;
        node.existing = existing;
        node.parentNode = parentNode;
        nodes.push(node);
      } else {
        const node = new TagNode(tag, existing, undefined, [], parentNode);
        nodes.push(node);
      }
    }
    nodes.sort((n1, n2) => n1.tag.name.localeCompare(n2.tag.name));
    nodes.forEach(node => {
      node.children = this.buildTreeNodes(toRemove, tags, trailsTags, node.tag.uuid, node);
    });
    return nodes;
  }

  private flatten(nodes: TagNode[]): TagNode[] {
    const flat: TagNode[] = [];
    this.flattenNodes(nodes, flat);
    return flat;
  }

  private flattenNodes(nodes: TagNode[], result: TagNode[]): void {
    nodes.forEach(node => {
      result.push(node);
      this.flattenNodes(node.children, result);
    });
  }

  newRootTag(): void {
    this.tagService.create(new Tag({
      owner: this.auth.email!,
      name: this.newTagName,
      collectionUuid: this.collectionUuid,
    }));
    this.newTagName = '';
  }

  startEdit(node: TagNode): void {
    node.newName = node.tag.name;
    node.editing = true;
    const startTime = Date.now();
    const autofocus = () => {
      const element = document.getElementById('editing-tag-' + node.tag.uuid);
      if (element) {
        const natives = element.getElementsByClassName('native-input');
        if (natives.length > 0) {
          (natives[0] as HTMLInputElement).focus();
          return;
        }
      }
      if (Date.now() - startTime < 15000) setTimeout(autofocus, 25);
    };
    setTimeout(autofocus, 0);
  }

  endEdit(node: TagNode, event$: CustomEvent<FocusEvent>): void {
    if (node.tag.name !== node.newName) {
      node.tag.name = node.newName;
      this.tagService.update(node.tag);
    }
    console.log((event$.detail.relatedTarget as any | null)?.nodeName);
    if ((event$.detail.relatedTarget as any | null)?.nodeName === 'ION-BUTTON') {
      // give the time for the delete button to be taken into account
      setTimeout(() => node.editing = false, 1000);
    } else {
      node.editing = false;
    }
  }

  async deleteTag(node: TagNode) {
    const alert = await this.alertController.create({
      header: this.i18n.texts.pages.trails.tags.popup.confirm_delete.title,
      message: this.i18n.texts.pages.trails.tags.popup.confirm_delete.message,
      buttons: [
        {
          text: this.i18n.texts.pages.trails.tags.popup.confirm_delete.yes,
          role: 'danger',
          handler: () => {
            this.tagService.delete(node.tag);
            alert.dismiss();
          }
        }, {
          text: this.i18n.texts.pages.trails.tags.popup.confirm_delete.no,
          role: 'cancel'
        }
      ]
    });
    await alert.present();
  }

  canApply(): boolean {
    return this.hasUserChanges(this.tree);
  }

  private hasUserChanges(nodes: TagNode[]): boolean {
    for (const node of nodes) {
      if (node.userSelected !== undefined) return true;
      if (this.hasUserChanges(node.children)) return true;
    }
    return false;
  }

  apply(): void {
    this.applyNodes(this.tree);
    this.modalController.dismiss(null, 'apply');
  }

  private applyNodes(nodes: TagNode[]): void {
    for (const node of nodes) {
      if (node.userSelected !== undefined) {
        if (node.userSelected) {
          for (const trail of this.trails!)
            this.tagService.addTrailTag(trail.uuid, node.tag.uuid);
        } else if (node.userSelected === false) {
          for (const trail of this.trails!)
            this.tagService.deleteTrailTag(trail.uuid, node.tag.uuid);
        }
      }
      this.applyNodes(node.children);
    }
  }

  cancel(): void {
    this.modalController.dismiss(null, 'cancel');
  }

}
