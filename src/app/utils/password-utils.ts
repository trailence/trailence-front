export const MIN_COMPLEXITY = 25;
export const COMPLEXITY_LEVELS = [10, 17, 25, 35, 43];

export class PasswordUtils {

  public static isValidPassword(password: string): boolean {
    return this.complexity(password) >= MIN_COMPLEXITY;
  }

  public static complexity(password: string): number {
    if (password.length === 0) return 0;
    let category = this.getCategory(password, 0);
    let combination = category.possibilities;
    const categories: CharCategory[] = [category];
    const lettersCategories: CharCategory[] = [category];
    let complexity = categories[0] instanceof DigitCategory ? 1 : (categories[0] instanceof LowerLetterCategory || categories[0] instanceof UpperLetterCategory) ? 4 : 10;
    let chars = password.charAt(0);
    for (let i = 1; i < password.length; ++i) {
      if (!chars.includes(password.charAt(i))) chars += password.charAt(i);
      category = this.getCategory(password, i);
      lettersCategories.push(category);
      if (!categories.includes(category)) {
        categories.push(category);
        combination *= category.possibilities;
      }
      let mult = combination;
      const char = password.charCodeAt(i);
      for (let j = i - 1; j >= 0 && lettersCategories[j] === category; --j) mult = (mult + category.possibilities) / 2;
      let j = i - 1;;
      while (j >= 0 && password.charCodeAt(j) === char) {
        mult *= 0.5;
        j--;
      }
      while (j >= 0) {
        if (password.charCodeAt(j) === char) mult *= 0.9;
        j--;
      }
      if (mult < 1.25) mult = 1.25;
      complexity *= mult;
    }
    let result = 0;
    while (complexity > 1) {
      result++;
      complexity /= 10;
    }
    if (password.length < 4 && result < Math.round(password.length * 0.75)) result = Math.round(password.length * 0.75);
    if (result < 1) result = 1;
    return result;
  }

  private static getCategory(s: string, i: number): CharCategory {
    for (const c of categories) if (c.belongs(s, i)) return c;
    throw 'Unknown category';
  }

}

interface CharCategory {
  possibilities: number;
  belongs(s: string, i: number): boolean;
}

class DigitCategory implements CharCategory {
  possibilities = 10;

  belongs(s: string, i: number): boolean {
    const c = s.charCodeAt(i);
    return c >= 48 && c <= 57;
  }
}

class LowerLetterCategory implements CharCategory {
  possibilities = 26;

  belongs(s: string, i: number): boolean {
    const c = s.charCodeAt(i);
    return c >= 97 && c <= 122;
  }
}

class UpperLetterCategory implements CharCategory {
  possibilities = 26;

  belongs(s: string, i: number): boolean {
    const c = s.charCodeAt(i);
    return c >= 65 && c <= 90;
  }
}

class SpecialCharacterCategory implements CharCategory {
  possibilities = 33;

  belongs(s: string, i: number): boolean {
    const c = s.charCodeAt(i);
    return (c >= 32 && c <= 47) || (c >= 58 && c <= 64) || (c >= 91 && c <= 96) || (c >= 123 && c <= 126)
  }
}

class VerySpecialCharacterCategory implements CharCategory {
  possibilities = 64;

  belongs(s: string, i: number): boolean {
    const c = s.charCodeAt(i);
    return c < 32 || c > 127;
  }
}


const categories: CharCategory[] = [
  new DigitCategory(),
  new LowerLetterCategory(),
  new UpperLetterCategory(),
  new SpecialCharacterCategory(),
  new VerySpecialCharacterCategory()
];
