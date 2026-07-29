// Repeated verbatim across every date-scoped tool's description (get_fires, get_fires_range,
// get_weather, get_cams, get_cams_summary) so the LLM gets identical "check get_latest_date
// first" guidance everywhere, rather than copy-pasted wording that can drift between tools.
export const CALL_GET_LATEST_DATE_FIRST_NOTE =
  'If the caller means "today"/"latest" without a specific date, call `get_latest_date` first — ' +
  "a 404 here often means the date hasn't finished ingesting yet, not that no data exists.";
