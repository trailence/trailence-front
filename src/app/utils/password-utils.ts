export const MIN_COMPLEXITY = 25;
export const COMPLEXITY_LEVELS = [10, 17, 25, 35, 43];

export class PasswordUtils {

  public static isValidPassword(password: string): boolean {
    return this.complexity(password) >= MIN_COMPLEXITY;
  }

  public static complexity(password: string): number {
    if (password.length === 0) return 0;
    const pass = [...password];
    let cp = pass[0].codePointAt(0)!;
    const distinctChars = new Set<number>();
    distinctChars.add(cp);
    let category = this.getCategory(cp);
    let factor = category.factor;
    const categories = new Set<CharCategory>();
    categories.add(category);
    const charCategories: CharCategory[] = [category];
    let complexity = category instanceof DigitCategory ? 1 : (category instanceof LowerLetterCategory || category instanceof UpperLetterCategory) ? 4 : 10;
    for (let i = 1; i < pass.length; ++i) {
      const c = pass[i];
      cp = c.codePointAt(0)!;
      distinctChars.add(cp);
      category = this.getCategory(cp);
      charCategories.push(category);
      if (!categories.has(category)) {
        categories.add(category);
        factor *= category.factor;
      }
      complexity *= this.getRepetitionPenalty(pass, c, category, i, factor, charCategories);
    }
    const diversity = distinctChars.size / pass.length;
    const diversityPenalty = 0.75 + 0.25 * diversity;
    complexity *= diversityPenalty;

    let result = 0;
    while (complexity > 1) {
      result++;
      complexity /= 10;
    }
    if (pass.length < 4 && result < Math.round(pass.length * 0.75)) result = Math.round(pass.length * 0.75);
    if (result < 1) result = 1;
    return result;
  }

  private static getCategory(codePoint: number): CharCategory {
    for (const c of categories) if (c.belongs(codePoint)) return c;
    throw new Error('Unknown category');
  }

  private static getRepetitionPenalty(pass: string[], c: string, category: CharCategory, i: number, factor: number, charCategories: CharCategory[]): number {
    let mult = factor;
    for (let j = i - 1; j >= 0 && charCategories[j] === category; --j) mult = (mult + category.factor) / 2;
    let j = i - 1;;
    while (j >= 0 && pass[j] === c) {
      mult *= 0.5;
      j--;
    }
    while (j >= 0) {
      if (pass[j] === c) mult *= 0.9;
      j--;
    }
    if (mult < 1.25) mult = 1.25;
    return mult;
  }

}

interface CharCategory {
  factor: number;
  belongs(codePoint: number): boolean;
}

class DigitCategory implements CharCategory {
  factor = 10;

  belongs(c: number): boolean {
    return c >= 48 && c <= 57;
  }
}

class LowerLetterCategory implements CharCategory {
  factor = 26;

  belongs(c: number): boolean {
    return c >= 97 && c <= 122;
  }
}

class UpperLetterCategory implements CharCategory {
  factor = 26;

  belongs(c: number): boolean {
    return c >= 65 && c <= 90;
  }
}

class SpecialCharacterCategory implements CharCategory {
  factor = 33;

  belongs(c: number): boolean {
    return (c >= 32 && c <= 47) || (c >= 58 && c <= 64) || (c >= 91 && c <= 96) || (c >= 123 && c <= 126)
  }
}

class VerySpecialCharacterCategory implements CharCategory {
  factor = 80; // much more possibilities, but this gives a complexity factor

  belongs(c: number): boolean {
    return c < 32 || c >= 127;
  }
}


const categories: CharCategory[] = [
  new DigitCategory(),
  new LowerLetterCategory(),
  new UpperLetterCategory(),
  new SpecialCharacterCategory(),
  new VerySpecialCharacterCategory()
];
