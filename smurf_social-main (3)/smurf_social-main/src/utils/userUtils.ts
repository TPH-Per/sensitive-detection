import { Generation } from '../../shared/types';

export const calculateGeneration = (dob: number | Date | null | undefined): Generation => {
  if (!dob) return Generation.UNKNOWN;
  const date = typeof dob === 'number' ? new Date(dob) : dob;
  const year = date.getFullYear();

  if (year >= 2013) return Generation.ALPHA;
  if (year >= 1997) return Generation.Z;
  if (year >= 1981) return Generation.MILLENNIALS;
  if (year >= 1965) return Generation.X;
  return Generation.BOOMERS;
};
