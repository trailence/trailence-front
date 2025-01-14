import { Component } from '../components/component';

export class TableComponent extends Component {

  public async searchColumnIndexByTitle(title: string) {
    const cols = await this.getElement().$('tr:first-child').$$('th').getElements();
    for (let i = 0; i < cols.length; ++i) {
      const colTitle = await cols[i].$('div.title').getText();
      if (colTitle === title) return i;
    }
    return -1;
  }

  public async searchCellByColumnIndexAndValue(colIndex: number, value: string) {
    const rows = await this.getElement().$$('tr').getElements();
    for (const row of rows) {
      const cells = await row.$$('td').getElements();
      if (cells.length <= colIndex) continue;
      const cell = cells[colIndex];
      const cellText = await cell.getText();
      if (cellText === value) return cell;
    }
    return undefined;
  }

  public async searchCellByColumnTitleAndValue(columnTitle: string, cellValue: string) {
    const colIndex = await this.searchColumnIndexByTitle(columnTitle);
    if (colIndex < 0) return undefined;
    return this.searchCellByColumnIndexAndValue(colIndex, cellValue);
  }

}
