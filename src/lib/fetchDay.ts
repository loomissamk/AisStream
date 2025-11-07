// src/lib/fetchDay.ts
import got from "got";
import unzipper from "unzipper";
import { parse } from "csv-parse";
import pino from "pino";

const log = pino();

export async function streamDay(
  day: string,                                // "YYYY-MM-DD"
  onRow: (row: Record<string, unknown>) => void
): Promise<void> {
  const [Y, M, D] = day.split("-");
  if (!Y || !M || !D) throw new Error(`Invalid day: ${day}`);

  const url = `https://coast.noaa.gov/htdata/CMSP/AISDataHandler/${Y}/AIS_${Y}_${M}_${D}.zip`;
  log.info({ url }, "fetch NOAA day");

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const ok = () => { if (!settled) { settled = true; resolve(); } };
    const fail = (e: unknown) => {
    if (!settled) {
      settled = true;
      if (e instanceof Error) {
        reject(e);
      } else {
        reject(new Error(`Unknown error: ${e as string}`));
      }
    }
  };

    try {
      const http = got.stream(url, {
        timeout: { request: 30_000 },
        retry: { limit: 2 },
        throwHttpErrors: true,
      });
      http.on("error", (e: Error) => fail(new Error(`HTTP: ${e.message}`)));

      const unzip = unzipper.ParseOne(/\.csv$/i);
      unzip.on("error", (e: Error) => {
        fail(new Error(`Unzip error: ${e.message}`));
      });

      const csv = parse({
        columns: true,
        bom: true,
        skip_empty_lines: true,
        relax_column_count: true,
      });
      csv.on("error", (e: Error) => {
        fail(new Error(`CSV error: ${e.message}`));
      });
      csv.on("readable", () => {
        let row: Record<string, unknown>;
        while ((row = csv.read() as Record<string, unknown>) !== null) {
          try {
            onRow(row);
          } catch (cbErr) {
            const msg = cbErr instanceof Error ? cbErr.message : String(cbErr);
            fail(new Error(`Error in row callback: ${msg}`));
            return;
          }
        }
      });
      csv.on("end", () => ok());

      http.pipe(unzip).pipe(csv);
    } catch (e) {
      fail(e);
    }
  });
}
