import { AppElement } from '../app/app-element';
import { TestUtils } from '../utils/test-utils';
import { IonicButton } from './ionic/ion-button';
import { IonicCheckbox } from './ionic/ion-checkbox';
import { IonicInput } from './ionic/ion-input';
import { ModalComponent } from './modal';

export class TagsPopup extends ModalComponent {

  constructor(
    type: 'edit' | 'selection',
    _parent: AppElement | ChainablePromiseElement | (() => ChainablePromiseElement),
    _selector?: string,
  ) {
    super(_parent, _selector);
    if (type === 'edit') {
      this.selectable = false;
      this.editing = true;
    } else {
      this.selectable = true;
      this.editing = false;
    }
  }

  private selectable: boolean;
  private editing: boolean;

  public async getAllTags() {
    const tags = [];
    if (this.editing) {
      const inputs = this.contentElement.$$('>>>div.tag-node ion-input');
      for (const input of await inputs.getElements()) {
        tags.push(await new IonicInput(input).getValue());
      }
    } else if (this.selectable) {
      const nodes = this.contentElement.$$('>>>div.tag-node');
      for (const node of await nodes.getElements()) {
        tags.push(await new IonicCheckbox(node.$('ion-checkbox')).getLabel());
      }
    } else {
      const nodes = this.contentElement.$$('>>>div.tag-node div.tag-name');
      for (const node of await nodes.getElements()) {
        tags.push(await node.getText());
      }
    }
    return tags;
  }

  public async selectTags(tags: string[], isPopup: boolean = true) {
    await TestUtils.retry(async () => {
      const nodes = (isPopup ? this.contentElement : this.getElement()).$$('>>>div.tag-node');
      const found = [];
      let selected = 0;
      for (const node of await nodes.getElements()) {
        const cb = new IonicCheckbox(node.$('ion-checkbox'));
        try {
          const tagName = await cb.getLabel();
          cb.setSelected(tags.indexOf(tagName) >= 0);
          found.push(tagName);
          if (tags.indexOf(tagName) >= 0) selected++;
        } catch (e) {
          throw new Error('Unable to select tag checkbox', {cause: e});
        }
      }
      if (selected !== tags.length)
        throw new Error('Cannot select all tags: expect to find ' + tags.join(',') + ' but the following tags were found: ' + found.join(','));
    }, 2, 100);
  }

  public async createTag(tagName: string) {
    const container = this.getElement().$('>>>form.add-tag-footer');
    const input = new IonicInput(container.$('ion-input'));
    await input.setValue(tagName);
    const addButton = new IonicButton(container.$('ion-button'));
    await addButton.click();
    await browser.waitUntil(() => this.getAllTags().then(tags => tags.indexOf(tagName) >= 0));
  }

  public async cancel() {
    const button = await this.getFooterButtonWithText('Cancel');
    await button.click();
    if (this.selectable && this.editing) {
      await browser.waitUntil(() => this.getFooterButtonWithText('Edit', false).then(b => b.isDisplayed()));
      this.editing = false;
    } else {
      await browser.waitUntil(() => this.getElement().isDisplayed().then(d => !d));
    }
  }

  public async apply() {
    const button = await this.getFooterButtonWithText('Apply');
    await button.click();
    await browser.waitUntil(() => this.getElement().isDisplayed().then(d => !d));
  }

  public async editName(currentName: string, newName: string) {
    const inputs = this.contentElement.$$('>>>div.tag-node ion-input');
    for (const input of await inputs.getElements()) {
      const i = new IonicInput(input);
      if (await i.getValue() === currentName) {
        await i.setValue(newName);
        return;
      }
    }
    throw Error('Tag not found: ' + currentName);
  }

  public async save() {
    const button = await this.getFooterButtonWithText('Save');
    await button.click();
    if (this.selectable) {
      await browser.waitUntil(() => button.isDisplayed().then(d => !d));
      this.editing = false;
    } else {
      await browser.waitUntil(() => this.getElement().isDisplayed().then(d => !d));
    }
  }

  public async editMode() {
    await (await this.getFooterButtonWithText('Edit', false)).click();
    this.editing = true;
  }

}
