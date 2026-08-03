export const gradeColors = [
  '#000070', // -15%
  '#1650C0', // -10% to -15%
  '#40A0F0', // -7% to -10%
  '#90D8FF', // -5% to -7%
  '#D8FFD8', // 5%-
  '#FFD890', // 7% to 5%
  '#F0A040', // 10% to 7%
  '#C05016', // 15% to 10%
  '#700000' // 15%+
];
  export const gradeLegend = [
    '<-15',
    '<-10',
    '<-7',
    '<-5',
    '± 5%',
    '> 5',
    '> 7',
    '> 10',
    '> 15'
  ];
  export function getGradeRange(grade: number): number {
    if (grade >= -0.05 && grade <= 0.05) return 4;
    if (grade < 0) {
      if (grade >= -0.07) return 3;
      if (grade >= -0.1) return 2;
      if (grade >= -0.15) return 1;
      return 0;
    }
    if (grade <= 0.07) return 5;
    if (grade <= 0.1) return 6;
    if (grade <= 0.15) return 7;
    return 8;
  }
