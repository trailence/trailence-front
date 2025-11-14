import { NgClass, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Injector, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonHeader, IonContent, IonFooter, IonToolbar, IonTitle, IonIcon, IonLabel, IonButton, IonButtons, ModalController, IonInput, IonCheckbox, AlertController } from "@ionic/angular/standalone";
import { Subscription, combineLatest, debounceTime } from 'rxjs';
import { Tag } from 'src/app/model/tag';
import { Trail } from 'src/app/model/trail';
import { TrailTag } from 'src/app/model/trail-tag';
import { AuthService } from 'src/app/services/auth/auth.service';
import { TagService } from 'src/app/services/database/tag.service';
import { TranslatedString } from 'src/app/services/i18n/i18n-string';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { collection$items } from 'src/app/utils/rxjs/collection$items';

export async function openTagsDialog(injector: Injector, trails: Trail[] | null, collectionUuid: string) {
  const modal = await injector.get(ModalController).create({
    component: TagsComponent,
    backdropDismiss: false,
    componentProps: {
      trails,
      collectionUuid,
      selectable: !!trails,
    }
  });
  modal.present();
}

class TagNode {

  public newName: string;
  public deleted = false;
  public focus = false;

  constructor(
    public tag: Tag,
    public allTaggedTrails: number,
    public inputTaggedTrails: number,
    public userSelected: boolean | undefined,
    public children: TagNode[] = [],
    public parentNode?: TagNode,
  ) {
    this.newName = tag.name;
  }

}

@Component({
    selector: 'app-tags',
    templateUrl: './tags.component.html',
    styleUrls: ['./tags.component.scss'],
    imports: [
      IonCheckbox, IonInput, IonButtons, IonButton, IonLabel, IonIcon, IonTitle, IonToolbar, IonFooter, IonContent, IonHeader,
      NgTemplateOutlet,
      NgClass,
      FormsModule,
    ]
})
export class TagsComponent implements OnInit, OnChanges, OnDestroy {

  @Input() inPopup = true;
  @Input() editable = true;
  @Input() collectionUuid?: string;
  @Input() trails?: Trail[];

  @Input() selectable = true;
  @Input() selection?: string[];
  @Output() selectionChange = new EventEmitter<Tag[]>();

  tree: TagNode[] = [];

  newTagName = '';
  editing = false;

  private subscription?: Subscription;

  constructor(
    public i18n: I18nService,
    private readonly modalController: ModalController,
    private readonly alertController: AlertController,
    private readonly tagService: TagService,
    private readonly auth: AuthService,
    private readonly changeDetector: ChangeDetectorRef,
  ) { }

  ngOnInit(): void {
    this.update();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['editable'] || changes['selectable'] || changes['trails'] || changes['collectionUuid'])
      this.update();
    else if (changes['selection'])
      this.updateSelection(this.tree);
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  private update(): void {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
    this.tree = [];
    if (this.editable && !this.selectable) this.editing = true;

    if (!this.collectionUuid) return;

    const tags$ = this.tagService.getAllTags$().pipe(
      collection$items(tag => tag.collectionUuid === this.collectionUuid)
    );
    const trailsTags$ = this.tagService.getAllTrailsTags$().pipe(collection$items());

    this.subscription = combineLatest([tags$, trailsTags$]).pipe(
      debounceTime(100)
    ).subscribe(
      ([tags, trailsTags]) => {
        this.tree = this.buildTree(tags, this.tree, trailsTags);
        this.changeDetector.detectChanges();
      }
    );
  }

  private buildTree(tags: Tag[], nodes: TagNode[], trailsTags: TrailTag[]): TagNode[] {
    const toRemove = this.flatten(nodes);
    const newTree =  this.buildTreeNodes(toRemove, tags, trailsTags, null);
    this.sort(newTree);
    if (toRemove.length > 0) this.removeNodes(this.tree, toRemove);
    return newTree;
  }

  private buildTreeNodes(toRemove: TagNode[], tags: Tag[], trailsTags: TrailTag[], parentUuid: string | null, parentNode?: TagNode): TagNode[] { // NOSONAR
    const nodes: TagNode[] = [];
    for (let i = 0; i < tags.length; ++i) {
      if (tags[i].parentUuid !== parentUuid) continue;
      const tag = tags[i];
      tags.splice(i, 1);
      i--;

      const index = toRemove.findIndex(node => node.tag.uuid === tag.uuid);
      let allTaggedTrails = 0;
      let inputTaggedTrails = 0;
      for (const trailTag of trailsTags) {
        if (trailTag.tagUuid !== tag.uuid) continue;
        allTaggedTrails++;
        if (this.trails?.some(t => t.uuid === trailTag.trailUuid)) inputTaggedTrails++;
      }
      if (index >= 0) {
        const node = toRemove[index];
        toRemove.splice(index, 1);
        node.tag = tag;
        node.allTaggedTrails = allTaggedTrails;
        node.inputTaggedTrails = inputTaggedTrails;
        node.parentNode = parentNode;
        if (this.selection?.includes(tag.uuid)) node.userSelected = true;
        nodes.push(node);
      } else {
        const node = new TagNode(tag, allTaggedTrails, inputTaggedTrails, undefined, [], parentNode);
        if (this.selection?.includes(tag.uuid)) node.userSelected = true;
        nodes.push(node);
      }
    }
    for (const node of nodes)
      node.children = this.buildTreeNodes(toRemove, tags, trailsTags, node.tag.uuid, node);
    return nodes;
  }

  private removeNodes(nodes: TagNode[], toRemove: TagNode[]): void {
    for (let i = 0; i < nodes.length; ++i) {
      this.removeNodes(nodes[i].children, toRemove);
      const index = toRemove.indexOf(nodes[i]);
      if (index >= 0) {
        nodes.splice(i, 1);
        i--;
        toRemove.splice(index, 1);
      }
      if (toRemove.length === 0) return;
    }
  }

  private flatten(nodes: TagNode[]): TagNode[] {
    const flat: TagNode[] = [];
    this.flattenNodes(nodes, flat);
    return flat;
  }

  private flattenNodes(nodes: TagNode[], result: TagNode[]): void {
    for (const node of nodes) {
      result.push(node);
      this.flattenNodes(node.children, result);
    };
  }

  private sort(nodes: TagNode[]): void {
    nodes.sort((n1, n2) => n1.tag.name.localeCompare(n2.tag.name));
    for (const node of nodes) this.sort(node.children);
  }

  newRootTag(): void {
    const name = this.newTagName.trim();
    if (name.length === 0) return;
    const tag = new Tag({
      owner: this.auth.email!,
      name: name,
      collectionUuid: this.collectionUuid,
    });
    if (this.trails) {
      this.tree.push(new TagNode(tag, 0, 0, true, [], undefined));
      this.sort(this.tree);
    }
    this.tagService.create(tag);
    this.newTagName = '';
  }

  startEdit(): void {
    if (!this.editable || this.editing) return;
    this.editing = true;
    this.changeDetector.detectChanges();
  }

  canSaveEdit(): boolean {
    return this.validateEdit(this.tree);
  }

  private validateEdit(nodes: TagNode[]): boolean {
    for (const node of nodes) {
      if (node.deleted) continue;
      if (node.newName.trim().length === 0) return false;
      if (node.newName.length > 50) return false;
      if (!this.validateEdit(node.children)) return false;
    }
    return true;
  }

  saveEdit(): void {
    this.saveNodes(this.tree);
    if (this.editable && !this.selectable) {
      this.cancel();
      return;
    }
    this.editing = false;
    this.sort(this.tree);
    this.changeDetector.detectChanges();
  }

  private saveNodes(nodes: TagNode[]): void {
    for (const node of nodes) {
      if (node.deleted) {
        this.tagService.delete(node.tag);
      } else if (node.newName !== node.tag.name) {
        node.tag.name = node.newName;
        this.tagService.update(node.tag, tag => tag.name = node.newName);
      }
      node.focus = false;
      this.saveNodes(node.children);
    }
  }

  cancelEdit(): void {
    this.cancelNodes(this.tree);
    if (this.editable && !this.selectable) {
      this.cancel();
      return;
    }
    this.editing = false;
    this.changeDetector.detectChanges();
  }

  private cancelNodes(nodes: TagNode[]): void {
    for (const node of nodes) {
      node.deleted = false;
      node.newName = node.tag.name;
      node.focus = false;
      this.cancelNodes(node.children);
    }
  }

  async deleteTag(node: TagNode) {
    if (node.allTaggedTrails === 0) {
      node.deleted = true;
      this.changeDetector.detectChanges();
      return;
    }
    const message = new TranslatedString('pages.trails.tags.popup.confirm_delete.message', [node.allTaggedTrails]);
    const alert = await this.alertController.create({
      header: this.i18n.texts.pages.trails.tags.popup.confirm_delete.title,
      message: message.translate(this.i18n),
      buttons: [
        {
          text: this.i18n.texts.pages.trails.tags.popup.confirm_delete.yes,
          role: 'danger',
          handler: () => {
            node.deleted = true;
            this.changeDetector.detectChanges();
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
    const add: {trailUuid: string, tagUuid: string}[] = [];
    const remove: {trailUuid: string, tagUuid: string}[] = [];
    this.applyNodes(this.tree, add, remove);
    if (remove.length > 0)
      this.tagService.deleteManyTrailTag(remove);
    if (add.length > 0)
      this.tagService.addTrailTags(add);
    this.modalController.dismiss(null, 'apply');
  }

  private applyNodes(nodes: TagNode[], add: {trailUuid: string, tagUuid: string}[], remove: {trailUuid: string, tagUuid: string}[]): void {
    for (const node of nodes) {
      if (node.userSelected !== undefined) {
        if (node.userSelected) {
          for (const trail of this.trails!)
            add.push({trailUuid: trail.uuid, tagUuid: node.tag.uuid});
        } else if (node.userSelected === false) {
          for (const trail of this.trails!)
            remove.push({trailUuid: trail.uuid, tagUuid: node.tag.uuid});
        }
      }
      this.applyNodes(node.children, add, remove);
    }
  }

  cancel(): void {
    this.modalController.dismiss(null, 'cancel');
  }

  selectionChanged(): void {
    this.selectionChange.emit(this.getSelection());
    this.changeDetector.detectChanges();
  }

  private getSelection(): Tag[] {
    const selection: Tag[] = [];
    this.fillSelection(selection, this.tree);
    return selection;
  }

  private fillSelection(selection: Tag[], nodes: TagNode[]): void {
    for (const node of nodes) {
      if (node.userSelected === true) {
        selection.push(node.tag);
      }
      this.fillSelection(selection, node.children);
    }
  }

  private updateSelection(nodes: TagNode[]): void {
    for (const node of nodes) {
      if (this.selection?.includes(node.tag.uuid))
        node.userSelected = true;
      else if (node.userSelected)
        node.userSelected = false;
      this.updateSelection(node.children);
    }
  }

}
