export const SAMPLE_DATA_URL = "/sample-sales-data.csv";
export const SAMPLE_DATA_FILENAME = "sample-sales-data.csv";

export const SAMPLE_QUESTIONS = [
  "total revenue by region",
  "revenue over time",
  "highest revenue day in North",
  "are there any outliers in revenue",
];

export async function fetchSampleDataFile(): Promise<File> {
  const res = await fetch(SAMPLE_DATA_URL);
  if (!res.ok) {
    throw new Error("Couldn't load the sample dataset.");
  }
  const blob = await res.blob();
  return new File([blob], SAMPLE_DATA_FILENAME, { type: "text/csv" });
}
