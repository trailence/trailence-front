export function computePercentagesWithoutDecimal(items: any[], percentProperty: string): void {
  const get = (item: any): number => item[percentProperty];

  // 1. compute floored and decimal
  const enriched = items.map(item => {
    const exact = get(item);
    const floored = Math.floor(exact);
    const decimal = exact - floored;

    return {
      item,
      exact,
      floored,
      decimal
    };
  });

  // 2. sum of floored parts
  let sum = enriched.reduce((acc, i) => acc + i.floored, 0);

  // 3. remaining to reach 100
  let remaining = 100 - sum;

  // 4. sort by decimal desc
  enriched.sort((a, b) => b.decimal - a.decimal);

  // 5. distribute remaining
  for (let i = 0; i < enriched.length && remaining > 0; i++) {
    enriched[i].floored += 1;
    remaining--;
  }

  // 6. apply to items
  for (const e of enriched) e.item[percentProperty] = e.floored;
}
