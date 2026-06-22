import { useMemo } from 'react';
import { indiaStatesDistricts, indiaStates } from '../../../data/indiaStatesDistricts';

/** Resolve a SearchableSelect value (string or {dropdownValue, otherValue} object) to a plain string */
const resolveValue = (input: any): string => {
  if (input && typeof input === 'object') {
    return input.dropdownValue === 'Other' ? (input.otherValue || '') : (input.dropdownValue || '');
  }
  return input || '';
};

export const useMasterData = (districtInput?: any, stateInput?: any) => {
  const state = useMemo(() => resolveValue(stateInput), [stateInput]);
  const district = useMemo(() => resolveValue(districtInput), [districtInput]);

  const states = useMemo(() => [...indiaStates], []);

  const districts = useMemo(() => {
    if (!state) return [];
    // Try exact match first, then case-insensitive
    const direct = indiaStatesDistricts[state];
    if (direct) return [...direct];
    const upperState = state.toUpperCase();
    const match = Object.entries(indiaStatesDistricts).find(([key]) => key.toUpperCase() === upperState);
    return match ? [...match[1]] : [];
  }, [state]);

  // Talukas and villages — generic options since we don't have taluka-level data per district
  const talukas = useMemo(() => {
    if (!district) return [];
    return ['Central', 'North', 'South', 'East', 'West', 'Urban', 'Rural'];
  }, [district]);

  const villages = useMemo(() => {
    return ['City / Ward', 'Village', 'Industrial Area', 'Project Site'];
  }, []);

  return {
    states,
    districts,
    talukas,
    villages,
  };
};
