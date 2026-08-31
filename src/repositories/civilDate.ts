const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const ptBrDatePattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;

const isLeapYear = (year: number) => year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);

const isValidCivilDate = (year: number, month: number, day: number) => {
  const daysByMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysByMonth[month - 1];
};

export const toPostgresDate = (value?: string): string | null => {
  const normalized = value?.trim();
  if (!normalized) return null;

  const isoMatch = isoDatePattern.exec(normalized);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    if (isValidCivilDate(Number(year), Number(month), Number(day))) return normalized;
  }

  const ptBrMatch = ptBrDatePattern.exec(normalized);
  if (ptBrMatch) {
    const [, day, month, year] = ptBrMatch;
    if (isValidCivilDate(Number(year), Number(month), Number(day))) return `${year}-${month}-${day}`;
  }

  throw new Error("Data civil inválida.");
};
