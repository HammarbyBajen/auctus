import { db } from "@/db";
import { exportSheet, toCsv, toXlsx } from "@/lib/salary/export";
import { getMonth, isMonth, testMonths } from "@/lib/salary/service";
import { formatMonth } from "@/lib/format";
import { requirePermission } from "@/lib/session";

/**
 * The month's hours as a file for the accountant (ticket 23): .xlsx or .csv.
 * A locked month gives its frozen figures. Owners only.
 */
export async function GET(request: Request) {
  const user = await requirePermission("salary", "read");
  const url = new URL(request.url);
  const month = url.searchParams.get("manad");
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  if (!isMonth(month)) return new Response("Okänd månad", { status: 400 });

  const { result, lockedAt } = await getMonth(db, user.studioId, month);
  if (!result) return new Response("Månaden är inte hämtad från Mana än", { status: 404 });

  const sheet = exportSheet(result);
  const name = `timmar-${month}${lockedAt ? "" : "-olast"}${testMonths.has(month) ? "-testdata" : ""}`;
  const headers = { "Cache-Control": "no-store" };
  if (format === "csv") {
    return new Response(toCsv(sheet), {
      headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` },
    });
  }
  return new Response(Buffer.from(toXlsx(sheet, formatMonth(month))), {
    headers: {
      ...headers,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}.xlsx"`,
    },
  });
}
