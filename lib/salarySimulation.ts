export function getSimulatorBaseSalary(currentSalary: number, medianSalary?: number | null) {
  const safeCurrent = Number.isFinite(currentSalary) ? Math.max(0, currentSalary) : 0;
  const safeMedian = Number.isFinite(Number(medianSalary)) ? Math.max(0, Number(medianSalary)) : 0;
  return Math.max(safeCurrent, safeMedian, 1);
}

export function getSimulatedSalary(currentSalary: number, medianSalary: number | null | undefined, salaryBoost: number) {
  const base = getSimulatorBaseSalary(currentSalary, medianSalary);
  const boost = Number.isFinite(salaryBoost) ? Math.max(0, salaryBoost) : 0;
  return Math.round(base * (1 + boost));
}
