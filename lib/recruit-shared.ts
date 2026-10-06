// Recruiting constants shared by the server and the browser.

/** Class years still in high school at `now` (seniors graduate in June). */
export function openClassYears(now = new Date()): number[] {
  const first = now.getUTCFullYear() + (now.getUTCMonth() >= 6 ? 1 : 0);
  return [first, first + 1, first + 2, first + 3];
}

/** ICSA conference → the ISSA district in the same region (for "near you"). */
export const CONFERENCE_DISTRICT: Record<string, string> = {
  PCCSC: "PCISA",
  NWICSA: "NWISA",
  MAISA: "MASSA",
  NEISA: "NESSA",
  SAILA: "SAISA",
  SEISA: "SEISA",
  MCSA: "MISSA",
};

export const DISTRICT_NAME: Record<string, string> = {
  PCISA: "Pacific Coast",
  NWISA: "Northwest",
  MASSA: "Mid-Atlantic",
  NESSA: "New England",
  SAISA: "South Atlantic",
  SEISA: "Southeast",
  MISSA: "Midwest",
};

export const districtLabel = (d: string) => (DISTRICT_NAME[d] ? `${d} (${DISTRICT_NAME[d]})` : d);

/** High school class of 2027 arrives in college in fall 2027 and graduates in 2031. */
export const collegeClass = (hsYear: number) => hsYear + 4;
